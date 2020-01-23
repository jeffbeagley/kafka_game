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
			name: 'pos',
			type: {
				type: "array",
				items: "int"

			}

		}
	]
}

let k = new kafka.producer('positioning', 1024, 0, schm)

//     k.sendEvent({"name": "jeff"})
//     k.sendEvent({"name": "ruth"})
//     k.sendEvent({"name": "joah"})

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
			pos: [data.pos[0], data.pos[1], data.pos[2], data.pos[3]]
		}

		k.sendEvent(m)

		
	})
})
server.listen(3000)
