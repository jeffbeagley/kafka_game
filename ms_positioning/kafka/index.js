const kafkanode = require('kafka-node')
const events = require('events')
const uuidv4 = require('uuid/v4')
const k_producer = kafkanode.Producer

const kafka_hosts = process.env.KAFKA_BROKER_HOSTS
const kafka_registry = require('avro-schema-registry')(process.env.KAFKA_REGISTRY_HOST)
const kafka_client = new kafkanode.KafkaClient({
	kafkaHost: kafka_hosts,
	connectTimeout: 5000,
	requestTimeout: 10000
})

var kafka_producer = null

kafka_client.on('connect', () => {
	console.log('kafkaClient ready and connected to:', Object.keys(kafka_client.brokers))
})

kafka_client.on('error', (err) => {
	console.log('kafkaClient error:', err)
})

kafka_client.on('reconnect', () => {
	console.log('reconnected')
})

class producer extends events {
	constructor(topic, batch_size = null, batch_age = null, schema = null) {
		super()

		this.topic = topic

		this._buffer = null
		this._batch_size = batch_size
		this._batch_age = batch_age
		this._batch_age_timer = null
		this._schema = schema

		this.create()
	}

	addChunk(buffer, callback) {
		// turn payload into a buffer in order to send to buffer
		if (this._buffer == null) {
			buffer = new Buffer.from(JSON.stringify(buffer))

			this._buffer = new Buffer.from(buffer)
		} else {
			buffer = new Buffer.from(',' + JSON.stringify(buffer))

			this._buffer = Buffer.concat([this._buffer, buffer])
		}

		if (this._batch_size == null || this._batch_age == null || (this._buffer && this._buffer.length > this._batch_size)) {
			console.log("Buffer is dumping")
			callback()
		} else {
			this.setupTimer(callback)
		}
	}

	setupTimer(callback) {
		let self = this

		if (this._batch_age_timer != null) {
			clearTimeout(this._batch_age_timer)
		}

		this._batch_age_timer = setTimeout(() => {
			if (self._buffer && self._buffer.length > 0) {
				callback()
			}
		}, this._batch_age)
	}

	getBatch() {
		return JSON.parse('[' + this._buffer.toString() + ']')
	}

	truncateBatch() {
		this._buffer = null
	}

	async create() {
		let self = this

		if (kafka_producer === null) {
			kafka_producer = new k_producer(kafka_client)

			kafka_producer.on('error', (err) => {
				console.log('kafkaProducer error:', err)
			})
		}

		//this is here for backwards compatability where some referneces would wait for producer to be ready
		setImmediate(function() {
			self.emit('ready', function(cb) {
				if (typeof cb === 'function') {
					cb()
				}
			})
		})
	}

	async sendEvent(payload, key = null) {
		let self = this

		let pl = ''

		// if payload is an object, the user has submitted json, and we need to convert to string
		if (typeof payload === 'object') {
			pl = JSON.stringify(payload)
		}

		// add config metadata to payload
		let p = {
			topic: self.topic,
			messages: pl, // multi messages should be a array, single message can be just a string or a KeyedMessage instance
			partitions: 1, // default 0
			attributes: 0, // default: 0
			timestamp: Date.now(), // <-- defaults to Date.now() (only available with kafka v0.10+),
			key: key
		}

		// add payload to buffer
		return new Promise((resolve) => {
			self.addChunk(p, async () => {
				let b = self.getBatch()

				
				//if avro, then we need to upconvert each message to avro buffer and send as a buffer
				if (self._schema != null) {
					let ps = b.map(async (m) => {
						m.messages = await kafka_registry.encodeMessage(self.topic, self._schema, JSON.parse(m.messages))

						return m
					})

					b = await Promise.all(ps)
				}

				kafka_producer.send(b, (err, data) => {
					//producer.send appears to internally buffer failed messages, so truncate our custom buffer here
					self.truncateBatch()

					if (err) {
						console.log('kafka producer error', err.message)

						return resolve(false)
					}

					return resolve(data)
				})
			})
		})
	}
}

class consumer extends events {
	constructor(topic, beginning_offset = null, consumer_group_id = null, message_type = 'utf8', partitions = 0) {
		super()

		this.topic = topic
		this.beginning_offset = beginning_offset
		this.k_consumer = null
		this.offset = null
		this.consumer_group_id = consumer_group_id
		this.partitions = partitions
		this.message_type = message_type

		this.create()

		kafka_client.on('reconnect', () => {
			this.create()
		})
	}

	async create() {
		console.log('consumer created')
		let self = this

		let start_over = false

		if (self.consumer_group_id === null) {
			self.consumer_group_id = 'kafka-node-group-' + uuidv4()
		}

		if (self.beginning_offset !== null) {
			start_over = true
			console.log('consumer is starting from offset:', self.beginning_offset)
			console.log('id: ', self.consumer_group_id)
		}

		let p = [
			{
				topic: self.topic,
				offset: self.beginning_offset, //default 0
				partitions: 0 // default 0
			}
		]

		if (self.partitions !== 0) {
			p = []

			for (let i = 0; i < self.partitions; i++) {
				p.push({
					topic: self.topic,
					offset: self.beginning_offset, //default 0
					partitions: i // default 0
				})
			}
		}

		//get partitions for this topic
		//let ps = await self.getPartitions(self.client, self.topic)

		let o = {
			groupId: self.consumer_group_id, //consumer group id, default `kafka-node-group`
			// Auto commit config
			autoCommit: true,
			autoCommitIntervalMs: 5000,
			// The max wait time is the maximum amount of time in milliseconds to block waiting if insufficient data is available at the time the request is issued, default 100ms
			fetchMaxWaitMs: 100,
			// This is the minimum number of bytes of messages that must be available to give a response, default 1 byte
			fetchMinBytes: 1,
			// The maximum bytes to include in the message set for this partition. This helps bound the size of the response.
			fetchMaxBytes: 1048576,
			// If set true, consumer will fetch message from the given offset in the payloads
			fromOffset: start_over,
			// If set to 'buffer', values will be returned as raw buffer objects.
			encoding: self.message_type,
			keyEncoding: 'utf8'
		}

		self.k_consumer = new kafkanode.Consumer(kafka_client, p, o)

		self.offset = new kafkanode.Offset(kafka_client)

		self.k_consumer.on('error', (err) => {
			console.log('consumer error', err)
		})

		self.consumeEvents()

		self.k_consumer.on('offsetOutOfRange', function(topic) {
			topic.maxNum = 2

			self.offset.fetch([topic], function(err, offsets) {
				if (err) {
					return console.error(err)
				}

				var min = Math.min.apply(null, offsets[topic.topic][topic.partition])
				self.k_consumer.setOffset(topic.topic, topic.partition, min)
			})
		})
	}

	async consumeEvents() {
		let self = this

		console.log(`Listening to Topic: ${self.topic}`)

		self.k_consumer.on('message', (message) => {
			// if(self.doesSchemaExist(message.value)) {
			//     console.log(message.value)
			//     registry.decodeMessage(new Buffer.from(message.value))
			//         .then((m) => {
			//             message.value = JSON.stringify(m)
			//             self.emit('event', message)
			//         })

			// } else {
			self.emit('event', message)

			//}
		})
	}

	getPartitions(client, topic) {
		console.log('getting partitions for topic: ' + topic)

		return new Promise((resolve) => {
			let o = new kafkanode.Offset(client)

			o.fetch(topic, function(err, offsets) {
				console.log(offsets)
				if (err) {
					return console.error(err)
				}

				return resolve(offsets)
			})
		})
	}
	/**
	 * check message payload for a schemaID, if so then assume this message is in avro format and needs decoding
	 * @param  {object} msg
	 * @returns {boolean} true|false
	 */
	doesSchemaExist(msg) {
		msg = new Buffer.from(msg)

		if (Buffer.isBuffer(msg) !== true) {
			return false
		}

		if (msg.readUInt8(0) !== 0) {
			return false
		}

		return true
	}
}

class consumerStream extends events {
	constructor(topic, beginning_offset = null, consumer_group_id = 'kafka-node-group-' + uuidv4()) {
		super()

		this._topic = topic
		this._beginning_offset = beginning_offset
		this._offset = 'earliest'
		this._consumer_group_id = consumer_group_id
		this._start_over = false
	}

	stream() {
		let self = this

		if (self._beginning_offset !== null) {
			self._offset = self._beginning_offset
			self._start_over = true
		}

		const consumerOptions = {
			kafkaHost: kafka_hosts,
			groupId: self._consumer_group_id,
			sessionTimeout: 15000,
			protocol: ['roundrobin'],
			asyncPush: false,
			id: self._consumer_group_id,
			fromOffset: self._offset,
			autoCommit: true,
			encoding: 'buffer',
			outOfRangeOffset: 'latest'
		}

		const consumerGroup = new kafkanode.ConsumerGroupStream(consumerOptions, self._topic)

		consumerGroup.consumerGroup.on('error', () => {
			console.log('error')
		})

		consumerGroup.consumerGroup.on('offsetOutOfRange', () => {
			console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!OFFSET OUT OF RANGE!!!!!!!!!!!!!!!!!!!!!!!!!')
		})

		return consumerGroup
	}
}

module.exports = {
	consumer,
	consumerStream,
	producer
}
