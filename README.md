raml-express-mongoose-scaffolder
================================

A POC around scaffolding an express + mongoDB from a RAML spec


To run int just type:

````
node raml-scaffold.js <RAML spec file>
````

And it will print to standard output the scaffolded API.


## To use the generated code in a node js application:


- [Install mongoDB](http://www.mongodb.org/downloads)
- Install express
    ````
    npm install express
    ````
- Install mongoose
    ````
    npm install mongoose
    ````
- Write a small express application and name it app.js:

````javascript
var express = require("express"),
    mongoose = require('mongoose');

var app = express();

// Database
mongoose.connect('mongodb://localhost/simple_api');

var Schema = mongoose.Schema;

// Config
app.configure(function () {
  app.use(express.logger());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

// Launch server
app.listen(4242);
````
- Create your scaffold from you [RAML](http://raml.org) spec
````
node raml-scaffold.js your_file.raml >> app.js
````
- Edit app.js and add the following line:

````javascript
setupScaffold(app);

// Launch server
app.listen(4242);

````
- Run you application:
````
node app.js
````
