/**
 * @license cs 0.0.1 Copyright (c) 2012, TruongSinh Tran-Nguyen <truongsinh@nextdays.com> and Social Ark Oy
 * Available via the MIT license.
 * 
 * Usage:
 *	config https://raw.github.com/ericclemmons/jinja.js/develop/build/build.min.js with requirejs's path and shim
 *	put this file in the root of your javascript folder
 *	config jinja
 requirejs.config({
	paths : {
		'lib/jinja' : '/js/lib/jinja.min',
		'jinja' : '/js/jinja', // jinja!
	},
	shim : {
		'lib/jinja' : {
			exports : function() {
				var Jinja = window.Jinja;
				delete window.Jinja;
				return Jinja;
			},
		},
	},
	jinja : {
		module: 'lib/jinja',// default 'jinjajs'
		extension : '.jinjs', // default '.jinja'
		baseUrl: '/templates'; // default '/templates'
	}
});
 * 
 * in other js/cs file,
define(function(require){
	var myTemplate, myContext, myContext;
	myTemplate = require('jinja!mytemplate') // Hello {{ world }}
 	myContext = {world: 'myWorld'}
  	myRendered = myTemplate(myContext) // Hello myWorld
})
 * or 
define(['jinja!mytemplate'], function(myTemplate){
 	myContext = {world: 'myWorld'}
  	myRendered = myTemplate(myContext) // Hello myWorld
})
 */

/*jslint */
/*global define, window, XMLHttpRequest, importScripts, Packages, java,
ActiveXObject, process, require */
// requirejs.s.contexts._.config is internal to requirejs
define([(requirejs.s.contexts._.config.jinja && requirejs.s.contexts._.config.jinja.module) || 'jinjajs'], function(Jinja) {'use strict';
	var moduleName, fs, getXhr, progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'], fetchText = function() {
		throw new Error('Environment unsupported.');
	}, buildMap = {};
	if ( typeof process !== "undefined" && process.versions && !!process.versions.node) {
		//Using special require.nodeRequire, something added by r.js.
		fs = require.nodeRequire('fs');
		fetchText = function(path, callback) {
			callback(fs.readFileSync(path, 'utf8'));
		};
	} else if (( typeof window !== "undefined" && window.navigator && window.document) || typeof importScripts !== "undefined") {
		// Browser action
		getXhr = function() {
			//Would love to dump the ActiveX crap in here. Need IE 6 to die first.
			var xhr, i, progId;
			if ( typeof XMLHttpRequest !== "undefined") {
				return new XMLHttpRequest();
			} else {
				for ( i = 0; i < 3; i++) {
					progId = progIds[i];
					try {
						xhr = new ActiveXObject(progId);
					} catch (e) {
					}

					if (xhr) {
						progIds = [progId];
						// so faster next time
						break;
					}
				}
			}

			if (!xhr) {
				throw new Error("getXhr(): XMLHttpRequest not available");
			}

			return xhr;
		};

		fetchText = function(url, callback) {
			var xhr = getXhr();
			xhr.open('GET', url, true);
			xhr.onreadystatechange = function(evt) {
				//Do not explicitly handle errors, those should be
				//visible via console output in the browser.
				if (xhr.readyState === 4) {
					callback(xhr.responseText);
				}
			};
			xhr.send(null);
		};
		// end browser.js adapters
	} else if ( typeof Packages !== 'undefined') {
		//Why Java, why is this so awkward?
		fetchText = function(path, callback) {
			var encoding = "utf-8", file = new java.io.File(path), lineSeparator = java.lang.System.getProperty("line.separator"), input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)), stringBuffer, line, content = '';
			try {
				stringBuffer = new java.lang.StringBuffer();
				line = input.readLine();

				// Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
				// http://www.unicode.org/faq/utf_bom.html

				// Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
				// http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
				if (line && line.length() && line.charAt(0) === 0xfeff) {
					// Eat the BOM, since we've already found the encoding on this file,
					// and we plan to concatenating this buffer with others; the BOM should
					// only appear at the top of a file.
					line = line.substring(1);
				}

				stringBuffer.append(line);

				while (( line = input.readLine()) !== null) {
					stringBuffer.append(lineSeparator);
					stringBuffer.append(line);
				}
				//Make sure we return a JavaScript string and not a Java string.
				content = String(stringBuffer.toString());
				//String
			} finally {
				input.close();
			}
			callback(content);
		};
	}

	return {
		get : function() {
			return Jinja;
		},

		write : function(pluginName, name, write) {
			if (buildMap.hasOwnProperty(name)) {
				var text = buildMap[name];
				write.asModule(pluginName + "!" + name, text);
			}
		},

		version : '0.0.1',

		load : function(name, parentRequire, load, config) {
			var path, extension, baseUrl;
			extension = (config.jinja && config.jinja.extension) || '.jinja';
			baseUrl = (config.jinja && config.jinja.baseUrl) || '/templates';
			path = baseUrl + '/' + name + extension;
			//Use a method to load the text (provide elsewhere)
			//by the plugin
			fetchText(path, function(template) {
				var returnFunction;
				returnFunction = function(context) {
					try {
						return Jinja.render(template, context)
					} catch (err) {
						err.message = "In " + path + ", " + err.message;
						throw (err);
					}
				};
				//Hold on to the transformed text if a build.
				if (config.isBuild) {
					buildMap[name] = returnFunction;
				}
				load(returnFunction);
			});
		}
	};
});
