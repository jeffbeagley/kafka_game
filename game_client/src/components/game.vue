<template>
	<v-app id="game_container">
		<div id="game">
			<v-dialog v-model="dialog" hide-overlay persistent width="300">
				<v-card color="primary" dark>
					<v-card-text>
						{{ loading_message }}
						<v-progress-linear indeterminate color="white" class="mb-0"></v-progress-linear>
					</v-card-text>
				</v-card>
			</v-dialog>

			<v-dialog v-model="name_form" persistent max-width="600px">
				<v-card>
					<v-card-title>
						<span class="headline">User Profile</span>
					</v-card-title>
					<v-card-text>
						<v-container>
							<v-row>
								<v-col cols="12" sm="6" md="4">
									<v-text-field label="Name*" required v-model="name"></v-text-field>
								</v-col>
							</v-row>
						</v-container>
						<small>*indicates required field</small>
					</v-card-text>
					<v-card-actions>
						<v-spacer></v-spacer>
						<v-btn color="blue darken-1" text @click="name_form = false">Cancel</v-btn>
						<v-btn color="blue darken-1" text @click="getPlayerName">Explore!</v-btn>
					</v-card-actions>
				</v-card>
			</v-dialog>
		</div>
	</v-app>
</template>

<script>
import Phaser from 'phaser';
import mapJSON from '../assets/map/map';
import io from 'socket.io-client';

export default {
	name: 'game',
	data() {
		return {
			name: 'jeff',
			socket: null,
			dialog: true,
			name_form: false,
			loading_message: 'Awaiting Server Connection...'
		};
	},
	methods: {
		getPlayerName() {
			let game = this;

			this.name_form = false;

			game.createGame();
		},
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

				this.load.image('golem', 'img/coppergolem.png');
				this.load.image('ent', 'img/dark-ent.png');
				this.load.image('demon', 'img/demon.png');
				this.load.image('worm', 'img/giant-worm.png');
				this.load.image('wolf', 'img/wolf.png');
				this.load.image('sword', 'img/attack-icon.png');
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
				game.socket = io('http://localhost:3000', {});

				game.socket.on('connect', () => {
					game.socket.emit('userJoin');

					let ws = this;

					this.otherPlayers = this.physics.add.group();

					// create map
					this.createMap();

					// create player animations
					this.createAnimations();

					// user input
					this.cursors = this.input.keyboard.createCursorKeys();
					this.wasd = {
						up: this.input.keyboard.addKey('W'),
						down: this.input.keyboard.addKey('S'),
						left: this.input.keyboard.addKey('A'),
						right: this.input.keyboard.addKey('D')
					};

					// listen for web socket events
					game.socket.on('currentPlayers', function(players) {
						console.log('currentPlayers event');
						Object.keys(players).forEach(function(id) {
							if (players[id].playerId === game.socket.id) {
								ws.createPlayer(players[id]);
							} else {
								ws.addOtherPlayers(players[id]);
							}
						});
					});

					game.socket.on('newPlayer', function(playerInfo) {
						ws.addOtherPlayers(playerInfo);
					});

					game.socket.on('disconnect', function(playerId) {
						ws.otherPlayers.getChildren().forEach(function(player) {
							if (playerId === player.playerId) {
								player.destroy();
							}
						});
					});

					game.socket.on('playerMoved', function(playerInfo) {
						ws.otherPlayers.getChildren().forEach(function(player) {
							if (playerInfo.name === player.playerId) {
								player.flipX = playerInfo.flipX;
								player.setPosition(playerInfo.position[0], playerInfo.position[1]);
							}
						});
					});
				});
			};

			worldScene.createMap = function() {
				// create the map
				this.map = this.make.tilemap({
					key: 'map'
				});

				// first parameter is the name of the tilemap in tiled
				var tiles = this.map.addTilesetImage('spritesheet', 'tiles', 16, 16, 1, 2);

				// creating the layers
				this.map.createStaticLayer('Grass', tiles, 0, 0);
				this.obstacles = this.map.createStaticLayer('Obstacles', tiles, 0, 0);

				// make all tiles in obstacles collidable
				this.obstacles.setCollisionByExclusion([-1]);

				// don't go out of the map
				this.physics.world.bounds.width = this.map.widthInPixels;
				this.physics.world.bounds.height = this.map.heightInPixels;
			};

			worldScene.createAnimations = function() {
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
			};

			worldScene.createPlayer = function(playerInfo) {
				// our player sprite created through the physics system
				this.player = this.add.sprite(0, 0, 'player', 6);

				this.container = this.add.container(playerInfo.x, playerInfo.y);
				this.container.setSize(16, 16);
				this.physics.world.enable(this.container);
				this.container.add(this.player);

				// add weapon
				this.weapon = this.add.sprite(10, 0, 'sword');
				this.weapon.setScale(0.5);
				this.weapon.setSize(8, 8);
				this.physics.world.enable(this.weapon);

				this.container.add(this.weapon);
				this.attacking = false;

				// update camera
				this.updateCamera();

				// don't go out of the map
				this.container.body.setCollideWorldBounds(true);

				this.physics.add.overlap(this.weapon, this.spawns, this.onMeetEnemy, false, this);
				this.physics.add.collider(this.container, this.spawns);
				this.physics.add.collider(this.container, this.obstacles);
			};

			worldScene.addOtherPlayers = function(playerInfo) {
				const otherPlayer = this.add.sprite(playerInfo.x, playerInfo.y, 'player', 9);
				otherPlayer.setTint(Math.random() * 0xffffff);
				otherPlayer.playerId = playerInfo.playerId;
				this.otherPlayers.add(otherPlayer);
			};

			worldScene.updateCamera = function() {
				// limit camera to map
				this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
				this.cameras.main.startFollow(this.container);
				this.cameras.main.roundPixels = true; // avoid tile bleed
			};

			worldScene.createEnemies = function() {
				// where the enemies will be
				this.spawns = this.physics.add.group({
					classType: Phaser.GameObjects.Sprite
				});
				for (var i = 0; i < 20; i++) {
					const location = this.getValidLocation();
					// parameters are x, y, width, height
					var enemy = this.spawns.create(location.x, location.y, this.getEnemySprite());
					enemy.body.setCollideWorldBounds(true);
					enemy.body.setImmovable();
				}

				// move enemies
				this.timedEvent = this.time.addEvent({
					delay: 3000,
					callback: this.moveEnemies,
					callbackScope: this,
					loop: true
				});
			};

			worldScene.moveEnemies = function() {
				this.spawns.getChildren().forEach((enemy) => {
					const randNumber = Math.floor(Math.random() * 4 + 1);

					switch (randNumber) {
						case 1:
							enemy.body.setVelocityX(50);
							break;
						case 2:
							enemy.body.setVelocityX(-50);
							break;
						case 3:
							enemy.body.setVelocityY(50);
							break;
						case 4:
							enemy.body.setVelocityY(50);
							break;
						default:
							enemy.body.setVelocityX(50);
					}
				});

				setTimeout(() => {
					this.spawns.setVelocityX(0);
					this.spawns.setVelocityY(0);
				}, 500);
			};

			worldScene.getEnemySpite = function() {
				var sprites = ['golem', 'ent', 'demon', 'worm', 'wolf'];
				return sprites[Math.floor(Math.random() * sprites.length)];
			};

			worldScene.getValidLocation = function() {
				var validLocation = false;
				var x, y;
				while (!validLocation) {
					x = Phaser.Math.RND.between(0, this.physics.world.bounds.width);
					y = Phaser.Math.RND.between(0, this.physics.world.bounds.height);

					var occupied = false;
					this.spawns.getChildren().forEach((child) => {
						if (child.getBounds().contains(x, y)) {
							occupied = true;
						}
					});
					if (!occupied) validLocation = true;
				}
				return {x, y};
			};

			worldScene.onMeetEnemy = function(player, enemy) {
				if (this.attacking) {
					const location = this.getValidLocation();
					enemy.x = location.x;
					enemy.y = location.y;
				}
			};

			worldScene.update = function() {
				if (this.container) {
					this.container.body.setVelocity(0);

					// Horizontal movement
					if (this.cursors.left.isDown) {
						this.container.body.setVelocityX(-80);
					} else if (this.cursors.right.isDown) {
						this.container.body.setVelocityX(80);
					}

					// Vertical movement
					if (this.cursors.up.isDown) {
						this.container.body.setVelocityY(-80);
					} else if (this.cursors.down.isDown) {
						this.container.body.setVelocityY(80);
					}

					// Update the animation last and give left/right animations precedence over up/down animations
					if (this.cursors.left.isDown) {
						this.player.anims.play('left', true);
						this.player.flipX = true;

						this.weapon.flipX = true;
						this.weapon.setX(-10);
					} else if (this.cursors.right.isDown) {
						this.player.anims.play('right', true);
						this.player.flipX = false;

						this.weapon.flipX = false;
						this.weapon.setX(10);
					} else if (this.cursors.up.isDown) {
						this.player.anims.play('up', true);
					} else if (this.cursors.down.isDown) {
						this.player.anims.play('down', true);
					} else {
						this.player.anims.stop();
					}

					if (Phaser.Input.Keyboard.JustDown(this.cursors.space) && !this.attacking) {
						this.attacking = true;
						setTimeout(() => {
							this.attacking = false;
							this.weapon.angle = 0;
						}, 150);
					}

					if (this.attacking) {
						if (this.weapon.flipX) {
							this.weapon.angle -= 10;
						} else {
							this.weapon.angle += 10;
						}
					}

					// emit player movement
					var x = this.container.x;
					var y = this.container.y;
					var flipX = this.player.flipX;
					if (this.container.oldPosition && (x !== this.container.oldPosition.x || y !== this.container.oldPosition.y || flipX !== this.container.oldPosition.flipX)) {
						let p = {
							name: game.socket.id,
							position: [x, y],
							flipX: flipX,
							speed: 0
						};

						game.socket.emit('playerMovement', p);
					}
					// save old position data
					this.container.oldPosition = {
						x: this.container.x,
						y: this.container.y,
						flipX: this.player.flipX
					};
				}
			};

			return worldScene;
		},
		createGame() {
			let game = this;

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
				scene: [game.preloadWorld(this, game), game.createWorld(this, game)]
			};

			game.dialog = false;

			new Phaser.Game(config);
		}
	},
	mounted() {
		let game = this;

		game.loading_message = 'Loading World...';

		game.name_form = true;
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
