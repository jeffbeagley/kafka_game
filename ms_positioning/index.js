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
			name: 'avatar',
			type: 'double'
		},
		{
			name: 'frame',
			type: 'double'
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
			avatar: msg.avatar,
			frame: msg.frame,
			position: [msg.position[0], msg.position[1]],
			flipX: msg.flipX,
			speed: 0
		}

		io.emit('playerMoved', p)

		//update internal state of user position
		players[msg.name].x = msg.position[0]
		players[msg.name].y = msg.position[1]
		players[msg.name].flipX = msg.flipX

		callback()
	}
})

c.pipe(messageTransform)

io.on('connection', (socket) => {
	console.log('a user connected:', socket.id)

	socket.on('userJoin', (player_info) => {
		console.log('a user joined')

		players[socket.id] = {
			flipX: false,
			x: 100,
			y: 100,
			playerId: socket.id,
			avatar: player_info.avatar,
			display_name: player_info.display_name
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
			avatar: data.avatar,
			frame: data.frame,
			position: data.position,
			flipX: data.flipX,
			speed: data.speed
		}

		k.sendEvent(m)
	})
})
server.listen(3000)
