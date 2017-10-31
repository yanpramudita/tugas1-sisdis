const express = require('express');
const bodyParser = require('body-parser');
const util = require('util');
const moment = require('moment');
const http = require('http');
const mongoose = require('mongoose');
const _ = require('lodash');
const fs = require('fs');
const Bluebird = require('bluebird');
const ip = require('ip');

const app = express();
const router = express.Router();

const port = process.env.PORT || 80;
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/';
const serviceRepositoryURL = process.env.SERVICE_REPOSITORY_URI || 'http://localhost/ewallet/list';
const User = require('./models/User');

const participants = [
  '1406543574',
  '1406579100', 
  '1306381704',
  '1406543725',
  '1406527620', 
  '1406527513',
  '1406543845',
  '1406543763'
]

app.use(bodyParser.json());

mongoose.Promise = Bluebird;
mongoose.connect(mongoURI, {
  useMongoClient: true,
  autoReconnect:true
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
          ip: ip.address(),
          npm: '1406543574'
        },
        {
          ip: ip.address(),
          npm: '1406579100',
        },{
          ip: ip.address(),
          npm: '1306381704',
        },{
          ip: ip.address(),
          npm: '1406543725',
        },{
          ip: ip.address(),
          npm: '1406527620',
        },{
          ip: ip.address(),
          npm: '1406527513',
        },{
          ip: ip.address(),
          npm: '1406543845',
        },{
          ip: ip.address(),
          npm: '1406543763',
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

router.get('/quorum', function(req, res) {
  getQuorum().then((quorum) => {
    res.json({quorum: quorum})
  })
  .catch(errorStatus => {
    errorStatus = _.isNumber(errorStatus) ? errorStatus : -99;
    sendError(req, res, {nilai_saldo: errorStatus});
  });
});

router.post('/getSaldo', function(req, res) {
  getQuorum().then((quorum) => {
    if (quorum < 5) {
      console.error(util.format('quorum tidak memenuhi 50%, hanya %s/8', (quorum)));
      return Bluebird.reject(-2);
    }
    return Bluebird.resolve();
  })
  .then(() => getSaldo(req.body.user_id))
  .then((nilai_saldo) => res.json({nilai_saldo: nilai_saldo}))
  .catch(errorStatus => {
    errorStatus = _.isNumber(errorStatus) ? errorStatus : -99;
    sendError(req, res, {nilai_saldo: errorStatus});
  });
});

router.post('/register', function(req, res) {
  getQuorum().then((quorum) => {
    if (quorum < 5) {
      console.error(util.format('quorum tidak memenuhi 50%, hanya %s/8', (quorum)));
      return Bluebird.reject(-2);
    }
    return Bluebird.resolve();
  })
  .then(() => register(req.body.user_id, req.body.nama))
  .then((status_register) => res.json({status_register: status_register}))
  .catch(errorStatus => {
    errorStatus = _.isNumber(errorStatus) ? errorStatus : -99;
    sendError(req, res, {status_register: errorStatus});
  });
});

router.post('/transfer', function(req, res) {
  getQuorum().then((quorum) => {
    if (quorum < 5) {
      console.error(util.format('quorum tidak memenuhi 50%, hanya %s/8', (quorum)));
      return Bluebird.reject(-2);
    }
    return Bluebird.resolve();
  })
  .then(() => transfer(req.body.user_id, req.body.nilai))
  .then((status_transfer) => res.json({status_transfer: status_transfer}))
  .catch(errorStatus => {
    errorStatus = _.isNumber(errorStatus) ? errorStatus : -99;
    sendError(req, res, {status_transfer: errorStatus});
  });
});

router.post('/getTotalSaldo', function(req, res) {
  getQuorum().then((quorum) => {
    if (quorum < 8) {
      console.error(util.format('quorum tidak memenuhi 100%, hanya %s/8', (quorum)));
      return Bluebird.reject(-2);
    }
    return Bluebird.resolve();
  })
  .then(() => getTotalSaldo(req.body.user_id))
  .then((nilai_saldo) => res.json({nilai_saldo: nilai_saldo}))
  .catch(errorStatus => {
    errorStatus = _.isNumber(errorStatus) ? errorStatus : -99;
    sendError(req, res, {nilai_saldo: errorStatus});
  });
});

function getTotalSaldo(user_id) {
  if(_.isUndefined(user_id)) {
    return Bluebird.reject(-99);
  }
  return new Bluebird((resolve, reject) => {
    getAllServices()
      .then((services) => {
        const targetMachine = _.find(services,
          (service) => _.isEqual(service.npm, user_id)
        );
        if(_.isUndefined(targetMachine)) {
          return reject(-1);
        }
        if(_.isEqual(targetMachine.ip, ip.address())){
          return getOwnTotalSaldo(user_id);
        }
        return getOtherTotalSaldo(targetMachine);
      })
      .then((nilai_saldo) => resolve(nilai_saldo))
      .catch(errorStatus => {
        errorStatus = _.isNumber(errorStatus) ? errorStatus : -99;
        reject(errorStatus);
      });
  });
}

function getOwnTotalSaldo(user_id) {
  if(_.isUndefined(user_id)) {
    return Bluebird.reject(-99);
  }
  return new Bluebird((resolve, reject) => {
    getAllServices()
      .then((services) => Bluebird.map(
        services, (service) => getSaldoFromOtherService(service, user_id)
      ))
      .then((listSaldp) => resolve(
        _.reduce(listSaldp, (sum, n) => sum+n, 0)
      ))
      .catch(err => {
        return reject(-3);
      });
  });
}

function getSaldoFromOtherService(service, user_id) {
  return new Bluebird((resolve, reject) => {
    const req = http.request({
      host: service.ip,
      path: '/ewallet/getSaldo' ,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      json: true
    }, (response)=> {
      var body = '';
      response.on('data', function(d) {
        body += d;
      }).on('end', function() {
        try {
          body = JSON.parse(body);
          if(!_.isInteger(_.parseInt(body.nilai_saldo))) {
            return reject(-99);
          }
          if(_.parseInt(body.nilai_saldo) >= 0){
            return resolve(_.parseInt(body.nilai_saldo));
          }
          return reject(_.parseInt(body.nilai_saldo));
        } catch (err) {
          return reject(-3);
        }
      }).on('error', function(err) {
        return reject(-3);
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
        return reject(-3);
    });

    req.write(JSON.stringify({user_id: user_id}));
    req.end();
  });
}

function getOtherTotalSaldo(service) {
  return new Bluebird((resolve, reject) => {
    const req = http.request({
      host: service.ip,
      path: '/ewallet/getTotalSaldo' ,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      json: true
    }, (response)=> {
      var body = '';
      response.on('data', function(d) {
        body += d;
      }).on('end', function() {
        try {
          body = JSON.parse(body);
          if(!_.isInteger(_.parseInt(body.nilai_saldo))) {
            return reject(-99);
          }
          if(_.parseInt(body.nilai_saldo) >= 0){
            return resolve(_.parseInt(body.nilai_saldo));
          }
          return resolve(_.parseInt(body.nilai_saldo));
        } catch (err) {
          return reject(-3);
        }
      }).on('error', function(err) {
        return reject(-3);
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
        return reject(-3);
    });

    req.write(JSON.stringify({user_id: service.npm}));
    req.end();
  });
}

function getSaldo(user_id) {
  if(_.isUndefined(user_id)) {
    return Bluebird.reject(-99);
  }
  if(mongoose.connection.readyState != 1){
    return Bluebird.reject(-4);
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
  if(mongoose.connection.readyState != 1){
    return Bluebird.reject(-4);
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

function transfer(user_id, value) {
  if(_.isUndefined(user_id)) {
    return Bluebird.reject(-99);
  }
  if(_.isUndefined(value) || !_.isInteger(_.parseInt(value))
    || _.parseInt(value) < 0 || _.parseInt(value) > 1000000000
  ) {
    return Bluebird.reject(-5);
  }
  if(mongoose.connection.readyState != 1){
    return Bluebird.reject(-4);
  }
  return new Bluebird((resolve, reject) => {
    User.findOne({user_id: user_id})
      .then((user) => {
        if(_.isUndefined(user) || _.isNull(user)) {
          return reject(-1);
        }
        user.nilai_saldo += _.parseInt(value);
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
          body = _.filter(JSON.parse(body),
            (service) => _.includes(participants, service.npm)
          );
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
      services,
      pingOtherService
    ))
    .then((pingResults) => Bluebird.resolve(
      _.reduce(pingResults, (sum, n) => sum+n, 0)
    ))
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
      },
      json: true
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
