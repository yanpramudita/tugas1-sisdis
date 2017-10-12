const express = require('express');
const bodyParser = require('body-parser');
const util = require('util');
const moment = require('moment');
const http = require('http');
const mongoose = require('mongoose');
const _ = require('lodash');
const fs = require('fs');
const Bluebird = require('bluebird');

const app = express();
const router = express.Router();

const port = process.env.PORT || 80;
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/';
const serviceRepositoryURL = process.env.SERVICE_REPOSITORY_URI || 'http://localhost/ewallet/list'

const User = require('./models/User');

app.use(bodyParser.json());

mongoose.Promise = Bluebird;
mongoose.connect(mongoURI, {
  useMongoClient: true,
});

router.post('/ping', function(req, res) {
  res.json({
    pong: 1
  });
});

if(!process.env.SERVICE_REPOSITORY_URI) {
  router.get('/list', function(req, res) {
    res.json(
      [
        {
          ip: 'localhost',
          npm: '1'
        },
        {
          ip: 'localhost',
          npm: '2',
        },{
          ip: 'localhost',
          npm: '3',
        },{
          ip: 'localhost',
          npm: '4',
        },{
          ip: 'localhost',
          npm: '5',
        },{
          ip: 'localhost',
          npm: '6',
        },{
          ip: 'localhost',
          npm: '7',
        },{
          ip: 'localhost',
          npm: '8',
        },{
          ip: 'localhost',
          npm: '9',
        },{
          ip: 'localhost',
          npm: '10',
        }
      ]
    );
  });
}

router.post('/getSaldo', function(req, res) {
  getQuorum().then((quorum) => {
    if (quorum < 4) {
      return Bluebird.reject(-2);
    }
    return Bluebird.resolve();
  })
  .then(() => getSaldo(req.body.user_id))
  .then((nilai_saldo) => res.json({nilai_saldo, nilai_saldo}))
  .catch(errorStatus => {
    errorStatus = _.isNumber(errorStatus) ? errorStatus : -99;
    sendError(req, res, {nilai_saldo: errorStatus});
  });
});

router.post('/register', function(req, res) {
  getQuorum().then((quorum) => {
    if (quorum < 4) {
      return Bluebird.reject(-2);
    }
    return Bluebird.resolve();
  })
  .then(() => register(req.body.user_id, req.body.nama))
  .then((status_register) => res.json({status_register, status_register}))
  .catch(errorStatus => {
    errorStatus = _.isNumber(errorStatus) ? errorStatus : -99;
    sendError(req, res, {status_register: errorStatus});
  });
});

function getSaldo(user_id) {
  if(_.isUndefined(user_id)) {
    return Bluebird.reject(-99);
  }
  return new Bluebird((resolve, reject) => {
    User.findOne({user_id: user_id})
      .then((user) => {
        if(_.isUndefined(user) || _.isNull(user)) {
          return reject(-1);
        }
        return resolve(user.nilai_saldo);
      })
      .catch(err => {
        return reject(-4);
      });
  });
}

function register(user_id, nama) {
  if(_.isUndefined(user_id) || _.isUndefined(nama)) {
    return Bluebird.reject(-99);
  }

  return new Bluebird((resolve, reject) => {
    User.findOne({user_id: user_id})
      .then((user) => {
        if(!_.isUndefined(user) && !_.isNull(user)) {
          return reject(-4);
        }
        user = new User();
        user.user_id = user_id;
        user.nama = nama;
        user.nilai_saldo = 0;
        user.save();
        return resolve(1);
      })
      .catch(err => {
        return reject(-4);
      });
  });
}

function getAllServices() {
  return new Bluebird((resolve, reject) => {
    http.get(serviceRepositoryURL, (response)=> {
      var body = '';
      response.on('data', function(d) {
        body += d;
      }).on('end', function() {
        try {
          body = JSON.parse(body);
          return resolve(body);
        } catch (err) {
          return reject(err);
        }
      }).on('error', function(err) {
        return reject(err);
      });
    })
  });
}


function getQuorum() {
  return getAllServices()
    .then((services) => Bluebird.map(
      _.take(_.shuffle(services),7),
      pingOtherService
    ))
    .spread((a,b,c,d,e,f,g) => Bluebird.resolve(a+b+c+d+e+f+g))
    .catch((err) => Bluebird.reject(err));
}

function pingOtherService(service) {
  return new Bluebird((resolve) => {
    const req = http.request({
      host: service.ip,
      path: '/ewallet/ping' ,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, (response)=> {
      var body = '';
      response.on('data', function(d) {
        body += d;
      }).on('end', function() {
        try {
          body = JSON.parse(body);
          return resolve(
            _.parseInt(body.pong) == 1 ? 1 :0
          );
        } catch (err) {
          return resolve(0);
        }
      }).on('error', function(err) {
        return resolve(0);
      });
    });

    req.on('socket', function (socket) {
        socket.setTimeout(10000);
        socket.on('timeout', function() {
            req.abort();
        });
    });

    req.on('error', function(err) {
      console.error(err);
        return resolve(0);
    });

    req.write('{}');
    req.end();
  });
}

function sendError(req, res, response) {
  res.status(500).json(response);
}


app.use('/ewallet', router);
app.listen(port);
console.log('Ewallet run on port ' + port);
