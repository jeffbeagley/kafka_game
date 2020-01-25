//envs
process.env.KAFKA_BROKER_HOSTS = 'localhost:19092,localhost:29092,localhost:39092'
process.env.KAFKA_REGISTRY_HOST = 'http://localhost:8081'

const server = require('http').createServer()
const io = require('socket.io')(server)
const kafka = require('./kafka')
const Transform = require('stream').Transform
const registry = require('avro-schema-registry')(process.env.KAFKA_REGISTRY_HOST)

const schm = {
	type: 'record',
	name: 'positioning',
	fields: [
		{
			name: 'name',
			type: 'string'
		},
		{
			name: 'position',
			type: {
				type: 'array',
				items: 'double'
			}
		},
		{
			name: 'flipX',
			type: 'boolean'
		},
		{
			name: 'speed',
			type: 'double'
		}
	]
}

const players = {}

let k = new kafka.producer('positioning', 1024, 0, schm)
let c = new kafka.consumerStream('positioning', 'latest').stream()

const messageTransform = new Transform({
	objectMode: true,
	decodeStrings: true,
	async transform(message, encoding, callback) {
		let msg = await registry.decode(message.value)

		let p = {
			name: msg.name,
			position: [msg.position[0], msg.position[1]],
			flipX: msg.flipX,
			speed: 0
		}

		io.emit('playerMoved', p)
		callback()
	}
})

c.pipe(messageTransform)

io.on('connection', (socket) => {
	console.log('a user connected:', socket.id)

	socket.on('userJoin', () => {
		console.log('a user joined')

		players[socket.id] = {
			flipX: false,
			x: Math.floor(Math.random() * 400) + 50,
			y: Math.floor(Math.random() * 500) + 50,
			playerId: socket.id
		}

		// send the players object to the new player
		socket.emit('currentPlayers', players)

		// update all other players of the new player
		socket.broadcast.emit('newPlayer', players[socket.id])
	})

	socket.on('disconnect', () => {
		console.log('user disconnected: ', socket.id)
		delete players[socket.id]
		// emit a message to all players to remove this player
		io.emit('disconnect', socket.id)
		console.log('current users:', players)
	})

	socket.on('playerMovement', (data) => {
		let m = {
			name: data.name,
			position: data.position,
			flipX: data.flipX,
			speed: data.speed
		}

		k.sendEvent(m)
	})
})
server.listen(3000)
