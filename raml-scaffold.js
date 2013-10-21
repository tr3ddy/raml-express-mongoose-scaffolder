"use strict";
var parser = require('./parser/raml.js');
var inflection = require('inflection');
var Handlebars = require('handlebars');

var parameters =  require('optimist')
    .usage('Usage: $0 raml-spec-file-name.yml')
    .demand(['_'])
    .describe('_', 'The full path to a RAML spec file. This file must conform to the latest RAML version (http://github.com/raml-org/spec)')
    .argv;

var fileName = parameters._[0];

parser.loadFile(fileName).then( function(data) {
  var output = [];
  var schemas = {};
  var i;

  data.resources.forEach(function(resource){
    emitRoutesForResource(output, schemas, resource, "", []);
  });

  emitSchemas(output, schemas);


  emitHeaderFooter(output);

  for(i = 0; i < output.length; i++) {
    console.log(output[i]);
  }

}, function(error) {
  console.log('There was an error with the RAML spec: ' + error.message);
});

function emitHeaderFooter(output) {
  output.unshift("function setupScaffold(app) {\n");
  output.push("}\n");
}


function emitSchemas(output, schemas) {
  Object.keys(schemas).forEach(function(schemaName){
    var schemaDef =
      '  var ' + schemaName + ' = new Schema('+ JSON.stringify(schemas[schemaName], null, 4) + ', { _id: false }  );\n  var ' + schemaName + 'Model = mongoose.model("' + schemaName + '", ' + schemaName + ');';
    output.unshift(schemaDef);
  });
}

function emitRoutesForResource(output, schemas, resource, relativePath, relativePathSegments) {
  var absoluteUri = relativePath + resource.relativeUri;
  var def;
  var absolutePathSegments = relativePathSegments.concat(resource.relativeUriPathSegments);

  resource.methods.forEach(function(method){
    def = emitMethodsForResource(absoluteUri, method, absolutePathSegments);
    output.push(def.output);
    if (def.schema.schema) {
        schemas[def.schema.name] = (def.schema.schema);
    }
  });

  if (!resource.resources) {
    return;
  }

  resource.resources.forEach(function(nestedResource){
    emitRoutesForResource(output, schemas, nestedResource, absoluteUri, absolutePathSegments);
  });
}

function emitMethodsForResource(absoluteUri, method, pathSegments) {
  var output;
  var methodUri;
  var successResponse;
  var responseSchema;
  var responseSchemaDefinition;
  var responseContentTypes;
  var responseContentType;
  var responseCodes;
  var responseCode;
  var resourceName;
  var mongooseSchema;
  var requestContentTypes;
  var requestContentType;
//  var requestHeaders = [];
//  var responseHeaders = [];
//  var queryParameters = [];
//  var requestSchema;
//  var requestSchemaDefinition;

  var composeHandlers = {
    get: composeGet,
    post: composePost,
    put: composePut,
    patch: function(){return ""},
    delete: composeDelete
  };

  // Try to guess the resource name
  resourceName = pathSegments.filter(function(element){return !element.match(/^{/)}).pop();
  resourceName = inflection.singularize(inflection.capitalize(resourceName), null);

  // Keep the lowest 2XX response as the successful response
  if (method.responses) {
    responseCodes = Object.keys(method.responses).filter(function(element){return element.match(/^2/)});
    responseCode = responseCodes.length ? responseCodes[0] : 0;
    if (responseCode) {
      successResponse =  method.responses[responseCode];
//      if (successResponse.headers)  {
//        responseHeaders = returnNamedParametersArray(successResponse.headers);
//      }
      if (successResponse.body) {
        // Try to match a json response
        responseContentTypes = Object.keys(successResponse.body).filter(function(element){return element.match(/json$/)});
        responseContentType = responseContentTypes.length ? responseContentTypes[0] : null;
        if (responseContentType) {
          responseSchema = successResponse.body[responseContentType].schema;
          if (responseSchema) {
            responseSchemaDefinition = JSON.parse(responseSchema);
            mongooseSchema = getMongooseSchemaFromJsonSchema(responseSchemaDefinition)
          }
        }
      }
    }
  }

  if (method.method === 'post' || method.method === 'put' || method.method === 'patch') {
    if (method.body) {
      requestContentTypes = Object.keys(method.body).filter(function(element){return element.match(/json$/)});
      requestContentType = requestContentTypes.length ? requestContentTypes[0] : null;
      if (requestContentType) {
//        requestSchema = method.body[requestContentType].schema;
//        if (requestSchema) {
//          requestSchemaDefinition = JSON.parse(requestSchema);
//        }
      }
    }
  }

//  if (method.queryParameters)  {
//    queryParameters = returnNamedParametersArray(method.queryParameters);
//  }
//  if (method.headers)  {
//    requestHeaders = returnNamedParametersArray(method.headers);
//  }

  methodUri = absoluteUri.replace(/}/g, '');
  methodUri = methodUri.replace(/{/g, ':');
  output = composeHandlers[method.method](methodUri, resourceName, mongooseSchema);
  return ({ output: output, schema: { name: resourceName, schema: mongooseSchema }  });
}

function getMongooseSchemaFromJsonSchema(jsonSchema) {
  var mongooseSchema = {};
  var jsonPropertyDefinition;

  if (jsonSchema.type !== 'object') {
    return null;
  }
  Object.keys(jsonSchema.properties).forEach(function(propertyName) {
    jsonPropertyDefinition = jsonSchema.properties[propertyName];
    mongooseSchema[propertyName] = { type: isJsonSchemaNumber(jsonPropertyDefinition.type) ? 'Number' : 'String'  }
    if (propertyName === 'id') {
        mongooseSchema[propertyName].index = { unique: true };
    }
  });
  if (jsonSchema.required) {
    jsonSchema.required.forEach(function(requiredPropertyName) {
      mongooseSchema[requiredPropertyName].required = true;
    });
  }
 return mongooseSchema;
}

function isJsonSchemaNumber(type) {
  return (type === 'integer' || type === 'number');
}

//function returnNamedParametersArray(nameParametersCollection) {
//  var result = [];
//
//  Object.keys(nameParametersCollection).forEach(function(parameterName) {
//    nameParametersCollection[parameterName].name = parameterName;
//    result.push(nameParametersCollection[parameterName]);
//  });
//  return result;
//}

function composeGet(uri, collectionName){
  var filter = getFilterFromUri(uri);
  var source =  ["  app.get('{{uri}}', function (req, res){",
                  "    return {{collectionName}}Model.find({{filter}}function (err, items) {",
                  "      if (!err) {",
                  "        return res.send(items);",
                  "      } else {",
                  "        return console.log(err);",
                  "      }",
                  "    });",
                  "  });"].join("\n");
  var data = { "uri": uri, "filter": filter, "collectionName": collectionName};
  var template = Handlebars.compile(source);
  return template(data);
}

function composeDelete(uri, collectionName) {
  var filter = getFilterFromUri(uri);
  var source = ["  app.delete('{{uri}}', function (req, res){",
                  "        return {{collectionName}}Model.findOne({{filter}} function (err, item) {",
                  "            return item.remove(function (err) {",
                  "                if (!err) {",
                  "                    console.log('removed');",
                  "                    return res.send('');",
                  "                } else {",
                  "                    console.log(err);",
                  "                }",
                  "            });",
                  "        });",
                  "  });"].join("\n");
  var data = { "uri": uri, "filter": filter, "collectionName": collectionName};
  var template = Handlebars.compile(source);
  return template(data);
}

function composePost(uri, collectionName, schema) {
    var schemaDescription = getSchemaForObject(schema);
    schemaDescription = schemaDescription.replace(/,\s*\n*\s*$/, "");

    var source =  ["  app.post('{{uri}}', function (req, res){",
            "    var item;",
            "    console.log(req.body);",
            "    item = new {{collectionName}}Model({",
            "{{schemaDescription}}",
            "    });",
            "    item.save(function (err) {",
            "        if (!err) {",
            "            return console.log('created');",
            "        } else {",
            "            return console.log(err);",
            "        }",
            "    });",
            "    return res.send(item);",
            "  });"].join("\n");
    var data = { "uri": uri, "schemaDescription": schemaDescription, "collectionName": collectionName};
    var template = Handlebars.compile(source);
    return template(data);
}

function composePut(uri, collectionName, schema) {
    var filter = getFilterFromUri(uri);
    var schemaDescription = getSchemaForJs(schema);

    var source = ["  app.put('{{uri}}', function (req, res){",
        "    return {{collectionName}}Model.findOne({{filter}} req.params.id, function (err, item) {",
        "{{schemaDescription}}",
        "        return item.save(function (err) {",
        "            if (!err) {",
        "                console.log('updated');",
        "            } else {",
        "                console.log(err);",
        "            }",
        "            return res.send(product);",
        "        });",
        "    });",
        "  });"].join("\n");

    var data = { "uri": uri, "filter": filter, "schemaDescription": schemaDescription, "collectionName": collectionName};
    var template = Handlebars.compile(source);
    return template(data);
}

function getSchemaForJs(schema) {
    var source = "{{#items}}        item.{{this}} = req.body.{{this}};\n{{/items}}";
    var data = { "items": Object.keys(schema)};
    var template = Handlebars.compile(source);
    return template(data);
}

function getSchemaForObject(schema) {
    var source = "{{#items}}        {{this}}: req.body.{{this}},\n{{/items}}";
    var data = { "items": Object.keys(schema)};
    var template = Handlebars.compile(source);
    return template(data);
}

function getFilterFromUri(uri) {
    var parameters = (uri.match(/\/:([^\/]+)\/?/g));
    var parameterName;
    var filter = "";

    if (parameters) {
        parameterName = parameters.pop().replace(/[\/:]/g, '');
    }

    if (parameterName) {
        filter = " { {{parameterName}}: req.params.{{parameterName}} }, ";
    }

    var data = { "parameterName": parameterName};
    var template = Handlebars.compile(filter);
    return template(data);
}