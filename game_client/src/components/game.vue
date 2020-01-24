<template>
	<div id="game"></div>
</template>

<script>
import Phaser from 'phaser';
import mapJSON from '../assets/map/map';
import io from 'socket.io-client';

// eslint-disable-next-line no-unused-vars

export default {
	name: 'game',
	data() {
		return {
			name: null,
			socket: null
		};
	},
	methods: {
		preloadWorld() {
			let preloadScene = new Phaser.Scene('preloadScene');

			preloadScene.preload = function() {
				// map tiles
				this.load.image('tiles', '/img/spritesheet-extruded.png');
				// map in json format
				this.load.tilemapTiledJSON('map', mapJSON);
				// our two characters
				this.load.spritesheet('player', '/img/RPG_assets.png', {
					frameWidth: 16,
					frameHeight: 16
				});
			};

			preloadScene.create = function() {
				this.scene.start('worldScene');
			};

			return preloadScene;
		},
		createWorld() {
			let game = this;
			let worldScene = new Phaser.Scene('worldScene');

			worldScene.create = function() {
				// create the map
				var map = this.make.tilemap({
					key: 'map'
				});

				// first parameter is the name of the tilemap in tiled
				var tiles = map.addTilesetImage('spritesheet', 'tiles', 16, 16, 1, 2);

				// creating the layers
				map.createStaticLayer('Grass', tiles, 0, 0);
				var obstacles = map.createStaticLayer('Obstacles', tiles, 0, 0);

				// make all tiles in obstacles collidable
				obstacles.setCollisionByExclusion([-1]);

				//  animation with key 'left', we don't need left and right as we will use one and flip the sprite
				this.anims.create({
					key: 'left',
					frames: this.anims.generateFrameNumbers('player', {
						frames: [1, 7, 1, 13]
					}),
					frameRate: 10,
					repeat: -1
				});

				// animation with key 'right'
				this.anims.create({
					key: 'right',
					frames: this.anims.generateFrameNumbers('player', {
						frames: [1, 7, 1, 13]
					}),
					frameRate: 10,
					repeat: -1
				});
				this.anims.create({
					key: 'up',
					frames: this.anims.generateFrameNumbers('player', {
						frames: [2, 8, 2, 14]
					}),
					frameRate: 10,
					repeat: -1
				});
				this.anims.create({
					key: 'down',
					frames: this.anims.generateFrameNumbers('player', {
						frames: [0, 6, 0, 12]
					}),
					frameRate: 10,
					repeat: -1
				});

				// our player sprite created through the phycis system
				this.player = this.physics.add.sprite(50, 100, 'player', 6);

				// don't go out of the map
				this.physics.world.bounds.width = map.widthInPixels;
				this.physics.world.bounds.height = map.heightInPixels;
				this.player.setCollideWorldBounds(true);

				// don't walk on trees
				this.physics.add.collider(this.player, obstacles);

				// limit camera to map
				this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
				this.cameras.main.startFollow(this.player);
				this.cameras.main.roundPixels = true; // avoid tile bleed

				// user input
				// TODO allow user to select which keyboard controls to use
				this.cursors = this.input.keyboard.createCursorKeys();
				this.wasd = {
					up: this.input.keyboard.addKey('W'),
					down: this.input.keyboard.addKey('S'),
					left: this.input.keyboard.addKey('A'),
					right: this.input.keyboard.addKey('D')
				};

				// where the enemies will be
				this.spawns = this.physics.add.group({
					classType: Phaser.GameObjects.Zone
				});
				for (var i = 0; i < 30; i++) {
					var x = Phaser.Math.RND.between(0, this.physics.world.bounds.width);
					var y = Phaser.Math.RND.between(0, this.physics.world.bounds.height);
					// parameters are x, y, width, height
					this.spawns.create(x, y, 20, 20);
				}
				// add collider
				this.physics.add.overlap(this.player, this.spawns, this.onMeetEnemy, false, this);
			};

			worldScene.onMeetEnemy = function(player, zone) {
				// we move the zone to some other location
				zone.x = Phaser.Math.RND.between(0, this.physics.world.bounds.width);
				zone.y = Phaser.Math.RND.between(0, this.physics.world.bounds.height);
			};

			worldScene.update = function() {
				let player_moved = false;
				// this.controls.update(delta);

				this.player.body.setVelocity(0);

				// Horizontal movement
				if (this.cursors.left.isDown || this.wasd.left.isDown) {
					this.player.body.setVelocityX(-80);
				} else if (this.cursors.right.isDown || this.wasd.right.isDown) {
					this.player.body.setVelocityX(80);
				}

				// Vertical movement
				if (this.cursors.up.isDown || this.wasd.up.isDown) {
					this.player.body.setVelocityY(-80);
				} else if (this.cursors.down.isDown || this.wasd.down.isDown) {
					this.player.body.setVelocityY(80);
				}

				// Update the animation last and give left/right animations precedence over up/down animations
				if (this.cursors.left.isDown || this.wasd.left.isDown) {
					this.player.anims.play('left', true);
					this.player.flipX = true;

					player_moved = true;
				} else if (this.cursors.right.isDown || this.wasd.right.isDown) {
					this.player.anims.play('right', true);
					this.player.flipX = false;

					player_moved = true;
				} else if (this.cursors.up.isDown || this.wasd.up.isDown) {
					this.player.anims.play('up', true);

					player_moved = true;
				} else if (this.cursors.down.isDown || this.wasd.down.isDown) {
					this.player.anims.play('down', true);

					player_moved = true;
				} else {
					this.player.anims.stop();
				}

				if (player_moved) {
					game.socket.emit('user move', {
						name: 'jeff',
						position: [this.player.body.position.x, this.player.body.position.y],
						previous_position: [this.player.body.prev.x, this.player.body.prev.y],
						speed: this.player.body.speed
					});
				}
			};

			return worldScene;
		},
		createGame() {
			let self = this;

			let config = {
				type: Phaser.AUTO,
				parent: 'game',
				width: 350,
				height: 240,
				zoom: 4,
				pixelArt: true,
				physics: {
					default: 'arcade',
					arcade: {
						gravity: {
							y: 0
						},
						debug: true // set to true to view zones
					}
				},
				scene: [self.preloadWorld(this, self), self.createWorld(this, self)]
			};

			new Phaser.Game(config);

			self.socket = io('http://localhost:3000', {});
		}
	},
	mounted() {
		this.createGame();
	}
};
</script>

<style>
ul {
	list-style: none;
	word-wrap: break-word;
}

#chatContainer {
	width: calc(100% - 960px);
}

.flex-container {
	display: flex;
	flex-wrap: wrap;
	align-content: stretch;
}

.flex-container > div {
	background-color: #f1f1f1;
}

/* Fix user-agent */

* {
	box-sizing: border-box;
}

html {
	font-weight: 300;
	-webkit-font-smoothing: antialiased;
}

html,
input {
	font-family: 'HelveticaNeue-Light', 'Helvetica Neue Light', 'Helvetica Neue', Helvetica, Arial, 'Lucida Grande', sans-serif;
}

html,
body {
	height: 100%;
	margin: 0;
	padding: 0;
}

/* Chat page */

.chat.page {
	display: none;
}

/* Font */

.messages {
	font-size: 150%;
}

.inputMessage {
	font-size: 100%;
}

.log {
	color: gray;
	font-size: 70%;
	margin: 5px;
	text-align: center;
}

/* Messages */

.chatArea {
	max-height: 660px;
	height: 660px;
	overflow-y: scroll;
}

.messages {
	height: 100%;
	margin: 0;
	overflow-y: scroll;
	padding: 10px 20px 10px 20px;
}

.message.typing .messageBody {
	color: gray;
}

.username {
	font-weight: 700;
	overflow: hidden;
	padding-right: 15px;
	text-align: right;
}

/* Input */

.inputMessage {
	border: 1px solid #000;
	bottom: 0;
	height: 60px;
	left: 0;
	outline: none;
	padding-left: 10px;
	right: 0;
	width: 100%;
}
</style>
