//envs
process.env.KAFKA_BROKER_HOSTS = "localhost:19092,localhost:29092,localhost:39092"
process.env.KAFKA_REGISTRY_HOST = "http://localhost:8081"

const kafka = require('./kafka/index.js')
const Transform = require('stream').Transform
const registry = require('avro-schema-registry')(process.env.KAFKA_REGISTRY_HOST)

let k = new kafka.consumerStream('positioning', "earliest").stream()

const messageTransform = new Transform({
	objectMode: true,
	decodeStrings: true,
	async transform(message, encoding, callback) {
		let msg = await registry.decode(message.value)
		console.log(msg)
		callback()
	}
})

k.pipe(messageTransform) //.pipe(s);