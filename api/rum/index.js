const beeline = require('honeycomb-beeline')({
  writeKey: process.env.HONEYCOMB_WRITE_KEY,
  dataset: 'www.tollmanz.com',
  serviceName: 'rum'
});

module.exports = (req, res) => {
  const trace = beeline.startTrace({
    foo: 'bar'
  });
  beeline.finishTrace(trace);

  res.json({
    hello: 'world'
  });
};
