# Jinja.js

Client-side rendering of Twig/Jinja/Jinjs templates.

- - -

## Get Started

### 1. Include Script


    <script src="lib/jinja.min.js"></script>

### 2. Add HTML Markup

    <script type="text/jinja" id="standalone">
        <h1>Welcome to {{ title|capitalize}}!</h1>
    </script>

### 3. Render

#### a. jQuery

    <script src="lib/jinja.jquery.js"></script>
    ...
    <script>
        // Replace #content with rendered template
        $('#content').jinja({ title: 'jinja.js' });
    </script>

#### b. Vanilla Javascript

    <script>
        var script      = document.getElementById('standalone');
        var template    = script.innerHTML;
        var context     = { title: 'jinja.js' };
        var content     = Jinja.render(template, context);

        document.write(content);

        // or

        var container = document.createElement('div');
        container.innerHTML = content;
        script.parentNode.replaceChild(container, script);
    </script>

- - -

## Building

A quick build script is included at `bin/build` that will install dependencies, compile & compress:


    $ ./bin/build
    npm info it worked if it ends with ok
    npm info using npm@1.1.0-2
    …
    Finished!

This will create:

* `build/build.js` -> `lib/jinja.js`
* `build/build.min.js` -> `lib/jinja.min.js`


### Requirements

* [NodeJS][nodejs]
* [npm][npm]
* [Browserify][browserify]
* Java (for YUI Compressor)

- - -

## Author

* Eric Clemmons <eric@smarterspam.com>

- - -

#### See Also

* [node-jinjs][jinjs]
* [node-browserify][browserify]


[nodejs]: http://nodejs.org/
[npm]: http://npmjs.org/
[browserify]: https://github.com/substack/node-browserify
[jinjs]: https://github.com/ravelsoft/node-jinjs/wiki
