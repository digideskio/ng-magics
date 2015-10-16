/// <reference path="../typings/globals.d.ts"/>
/// <reference path="../typings/lib.d.ts"/>

import * as angular from 'angular';

import constantsModule from './constants';

class MagicsProvider {
	static $inject = ['tweenEasing'];

	$ = <any> {};

	scrollOptions;

	debug = false;

	debugOptions = {};

	sceneOptions = {};

	stageOptions = {};

	pinOptions = {};

	performanceOptions = {
		brake: 'debounce',
		delay: 50
	};

	constructor(...deps) {
		let self = <INgConstructor> this.constructor;

		angular.forEach(self.$inject, (depName, i) => {
			this.$[depName] = deps[i];
		});

		// TODO: proper typing
		(<any> this.$get).$inject = MagicsInstance.$inject;

		this.scrollOptions = {
			y: true,
			duration: 0.75,
			ease: this.$.tweenEasing.Power2.easeInOut
		};
	}

	$get(...deps) {
		let instance = Object.create(MagicsInstance.prototype);

		MagicsInstance.apply(instance, [this, ...deps]);

		return instance;
	}
}

class MagicsInstance {
	static $inject = ['$cacheFactory', '$q', '$rootScope', '$window', 'debounce', 'throttle', 'scrollMagic', 'Tween'];

	_provider;
	_brake;
	_delay;
	_scenes;
	_stages;

	$ = <any> {};

	constructor(provider, ...deps) {
		let self = <INgConstructor> this.constructor;

		angular.forEach(self.$inject, (depName, i) => {
			this.$[depName] = deps[i];
		});

		this._provider = provider;

		//

		let { $cacheFactory, debounce, throttle } = this.$;

		this._brake = (this._provider.performanceOptions.brake === 'throttle')
			? throttle
			: debounce;

		this._delay = this._provider.performanceOptions.delay;

		let cache = $cacheFactory('magics');

		this._scenes = cache.put('scenes', {});
		this._stages = cache.put('stages', {});

		this.stage('default', {});
	}

	_isEmpty(val) {
		return ([null, undefined, ''].indexOf(val) >= 0);
	}

	_patch(name, type, instance) {
		if ('$$patched' in instance) {
			return instance;
		}

		let destroy_ = instance.destroy;
		instance.destroy = (...args) => {
			if (type === 'stage' && name === 'default') {
				// original .destroy() return null
				return true;
			}

			// handling stage/scene name is not possible when decorating with .extend()
			let storageName = '_' + type + 's';
			delete this[storageName][name];

			return destroy_.apply(instance, args);
		};

		instance.$$patched = true;

		return instance;
	}

	// TODO: swappable method
	// stage.scrollTo accepts 1 optional argument
	_scrollHandler = (target, [container, deferred]) => {
		let { $rootScope, Tween } = this.$;

		let scrollOptions = this._provider.scrollOptions;

		function completeHandler() {
			deferred.resolve();
			$rootScope.$apply();
		}

		function autoKillHandler() {
			deferred.reject();
			$rootScope.$apply();
		}

		let scrollToOptions = <any> {
			autoKill: true,
			onAutoKill: autoKillHandler
		};

		if (scrollOptions.x) {
			scrollToOptions.x = target;
		}

		if (scrollOptions.y) {
			scrollToOptions.y = target;
		}

		Tween.to(container, scrollOptions.duration, {
			scrollTo: scrollToOptions,
			ease: scrollOptions.ease,
			onComplete: completeHandler
		});
	};

	stage(name, options) {
		let { $window, scrollMagic } = this.$;

		if (this._isEmpty(name)) {
			name = 'default';
		}

		// TODO: duplicate warning for 'options'
		if (name in this._stages) {
			return this._stages[name];
		}

		let stageOptions = angular.extend(
			{},
			this._provider.stageOptions,
			{
				globalSceneOptions: this._provider.sceneOptions,
				// TODO: custom container	
				container: this._provider.container || $window
			},
			options
		);

		let stage = this._stages[name] = new scrollMagic.Controller(stageOptions);

		stage.scrollTo(this._scrollHandler);

		return this._patch(name, 'stage', stage);
	}

	scene(name, options, stageName) {
		let { $rootScope, scrollMagic } = this.$;

		// TODO: duplicate warning for 'options'
		if (name in this._scenes) {
			return this._scenes[name];
		}

		if (this._isEmpty(stageName)) {
			stageName = 'default';
		}

		let stage = this._stages[stageName];

		let scene = this._scenes[name] = (new scrollMagic.Scene(options)).addTo(stage);

		if (this._provider.debug) {
			scene.addIndicators(angular.extend({}, this._provider.debugOptions, {
				name: name
			}));
		}

		this.onSceneEnter(name, (e) => {
			$rootScope.$broadcast('sceneEnter:' + name, e);
			$rootScope.$broadcast('sceneEnter', name, e);
		});

		this.onSceneLeave(name, (e) => {
			$rootScope.$broadcast('sceneLeave:' + name, e);
			$rootScope.$broadcast('sceneLeave', name, e);
		});

		return this._patch(name, 'scene', scene);
	}

	scrollToScene(scene, offset) {
		let { $q, scrollMagic } = this.$;

		offset = offset || 0;

		if (angular.isString(scene)) {
			scene = this._scenes[scene];
		}

		if (!(scene instanceof scrollMagic.Scene)) {
			return false;
		}

		let target = scene.scrollOffset() + offset;

		let stage = scene.controller();
		let container = stage.info('container');

		let deferred = $q.defer();

		// the proper use case for Deferred, one and only
		stage.scrollTo(target, [container, deferred]);

		return deferred.promise;
	}

	// TODO: ? stage namespacing, brake per stage
	// TODO: additional params

	onSceneEnter(name, handler) {
		let brakedHandler = this._brake(handler, this._delay);

		this._scenes[name].on('enter.ngMagics', brakedHandler);

		return () => {
			let scene = this._scenes[name];

			if (scene) {
				scene.off('enter.ngMagics', brakedHandler);
			}
		};
	}

	onSceneLeave(name, handler) {
		let brakedHandler = this._brake(handler, this._delay);
		let scene = this._scenes[name];

		scene.on('leave.ngMagics', brakedHandler);

		return () => {
			let scene = this._scenes[name];

			if (scene) {
				scene.off('leave.ngMagics', brakedHandler);
			}
		};
	}

	// TODO: onScenePoint

	onSceneProgress(name, handler) {
		let scene = this._scenes[name];

		scene.on('progress.ngMagics', handler);

		return () => {
			let scene = this._scenes[name];

			if (scene) {
				scene.off('progress.ngMagics', handler);
			}
		};
	}

	onSceneDestroy(name, handler) {
		let scene = this._scenes[name];

		scene.on('destroy.ngMagics', handler);

		return () => {
			let scene = this._scenes[name];

			if (scene) {
				scene.off('destroy.ngMagics', handler);
			}
		};
	}
}

export default angular.module('ngMagics.magics', [constantsModule])
	.provider('magics', MagicsProvider)
	.name;