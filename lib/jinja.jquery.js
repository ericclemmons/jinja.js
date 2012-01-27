/*
    Script:         jinja.jquery.js
    Author:         eric@smarterspam.com
    Version:        0.1
    Repository:     http://github.com/ericclemmons/jinja.js
    License:        http://www.opensource.org/licenses/mit-license.php

    Copyright (c) 2012 Eric Clemmons
*/

jQuery.fn.jinja = function(context) {
    if (! this.length) {
        return false;
    }

    var content = Jinja.render(this.html(), context);

    return this.replaceWith(content);
};
