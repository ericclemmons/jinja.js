require.define('jinja.js', function(require, module, exports) {
    var __initialized   = false;
    var env             = require('/environment').defaultEnvironment;
    var templateIdMap = {};

    exports.init = function() {
        var scripts     = document.getElementsByTagName('script');

        for (var i = 0; i < scripts.length; i++) {
            var script = scripts[i];

            if ('text/jinja' === script.getAttribute('type')) {
                // Setup each template #id with `require`
                templateIdMap[script.id] = script.innerHTML;

                require.define(script.id, function(trequire, tmodule, texports, dirname, filename) {
                    texports.render = function(context) {
                        return exports.render(templateIdMap[filename], context);
                    };
                });
            }
        }

        __initialized  = true;
    };

    exports.render = function(content, context) {
        // Lazy-load any templates that may be included
        if (!__initialized) {
            exports.init();
        }

        return env.getTemplateFromString(content).render(context);
    };
});

window.Jinja = require('jinja.js');
