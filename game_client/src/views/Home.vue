<template>
	<div class="home">
		<game />
	</div>
</template>

<script>
// @ is an alias to /src
import game from '@/components/game.vue';

export default {
	name: 'home',
	components: {
		game
	}
};
</script>
