//envs
process.env.KAFKA_BROKER_HOSTS = 'localhost:19092,localhost:29092,localhost:39092'
process.env.KAFKA_REGISTRY_HOST = 'http://localhost:8081'

const server = require('http').createServer()
const io = require('socket.io')(server)
const kafka = require('./kafka')

const schm = {
	type: 'record',
	name: 'positioning',
	fields: [
		{
			name: 'name',
			type: 'string'
		}, {
			name: 'position',
			type: {
				type: "array",
				items: "double"
			}
		}, {
			name: 'previous_position',
			type: {
				type: "array",
				items: "double"
			}
		}, {
			name: 'speed',
			type: 'double'

		}
	]
}

let k = new kafka.producer('positioning', 1024, 0, schm)

io.on('connection', (client) => {
	client.on('event', (data) => {
		/* … */
	})
	client.on('disconnect', () => {
		/* … */
	})

	client.on('add user', (data) => {
		//console.log(data)
	})

	client.on('user move', (data) => {
		console.log(data);
		let m = {
			name: data.name,
			position: data.position,
			previous_position: data.previous_position,
			speed: data.speed
		}

		k.sendEvent(m)

		
	})
})
server.listen(3000)
