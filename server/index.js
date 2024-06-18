const static = require('node-static');
const port = 3080;
const file = new static.Server('.', { cache: 0, headers: {'X-Hello':'World!'} });

require('http').createServer(function (req, res) {
    req.url = '' + req.url;
    file.serve(req, res, function (err, res) {
        if (err) {
            console.error("> Error serving " + req.url + " - " + err.message);
            res.writeHead(err.status, err.headers).end();
        } else {
            console.log("> " + req.url + " - " + res.message);
        }
    });
}).listen(port);

console.log("> node-static is listening on http://127.0.0.1:" + port);
