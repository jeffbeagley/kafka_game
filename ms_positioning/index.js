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
			name: 'session_id',
			type: 'string',
		},
		{
			name: 'client_time',
			type: 'long',
		},
		{
			name: 'frame',
			type: 'double',
		},
		{
			name: 'position',
			type: {
				type: 'array',
				items: 'double',
			},
		},
		{
			name: 'flipX',
			type: 'boolean',
		},
		{
			name: 'speed',
			type: 'double',
		},
		{
			name: 'server_processed',
			type: 'boolean',
		},
	],
}

const player_schema = {
	session_id: '0',
	display_name: 'Player',
	avatar: 6,
	position_events: [],
}

const position_event_schema = {
	session_id: '',
	client_time: '',
	frame: 1,
	position: [100, 100],
	flipX: false,
	speed: 0,
	server_processed: false,
}

const players = {}

let k = new kafka.producer('positioning', 1024, 0, schm)
let c = new kafka.consumerStream('positioning', 'latest').stream()

io.on('connection', (socket) => {
	socket.on('userJoin', (joined_player) => {
		let new_player = {...player_schema}
		let new_player_position = {...position_event_schema}

		new_player.session_id = socket.id
		new_player.display_name = joined_player.display_name
		new_player.avatar = parseInt(joined_player.avatar)

		new_player_position.session_id = socket.id
		new_player_position.frame = parseInt(joined_player.frame)
		new_player_position.position = [100, 100]
		new_player_position.flipX = false
		new_player_position.speed = 0
		new_player_position.server_processed = true

		players[socket.id] = new_player

		players[socket.id].position_events = []
		players[socket.id].position_events.push(new_player_position)

		// send the players object to the new player
		socket.emit('currentPlayers', players)

		// update all other players of the new player
		socket.broadcast.emit('newPlayer', players[socket.id])

		console.log(players)
		console.log(`${joined_player.display_name} joined the realm`)
		console.log(`${Object.keys(players).length} players`)
	})

	socket.on('disconnect', () => {
		delete players[socket.id]
		// emit a message to all players to remove this player
		io.emit('disconnect', socket.id)
		console.log(`${Object.keys(players).length} players`)
	})

	socket.on('playerMovement', async (player_movement_event) => {
		//grab current player object from players
		let player_movement = {...position_event_schema}

		player_movement.session_id = player_movement_event.session_id
		player_movement.client_time = player_movement_event.client_time
		player_movement.frame = player_movement_event.frame
		player_movement.position = player_movement_event.position
		player_movement.flipX = player_movement_event.flipX
		player_movement.speed = player_movement_event.speed

		players[player_movement_event.session_id].position_events.push(player_movement)

		//send to event queue
		try {
			await k.sendEvent(player_movement)
		} catch (err) {
			console.log('failed to send playerMovement', player_movement)
		}
	})
})

const messageTransform = new Transform({
	objectMode: true,
	decodeStrings: true,
	async transform(message, encoding, callback) {
		let msg = await registry.decode(message.value)

		let this_player = players[msg.session_id]
		let player_movement = {...position_event_schema}

		player_movement.session_id = msg.session_id
		player_movement.client_time = msg.client_time
		player_movement.frame = msg.frame
		player_movement.position = msg.position
		player_movement.flipX = msg.flipX
		player_movement.speed = msg.speed
		player_movement.server_processed = true

		//update server player state
		players[msg.session_id] = this_player

		//update the server player position state event for this particular time as processed by server
		players[msg.session_id].position_events.forEach((event, index, object) => {
			if (event.client_time === player_movement.client_time) {
				event.server_processed = true

			} else {
				if(event.server_processed = true && event.client_time < player_movement.client_time) {
					object.splice(index, 1)

				}

			}
		})

		console.log('player_moved')
		io.emit('playerMoved', player_movement)

		callback()
	},
})

c.pipe(messageTransform)

server.listen(3000)
