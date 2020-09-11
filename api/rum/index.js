const honeycomb = require('honeycomb-beeline')({
  writeKey: process.env.HONEYCOMB_WRITE_KEY,
  dataset: 'www.tollmanz.com',
  serviceName: 'rum'
});

module.exports = (req, res) => {
  res.json({
    hello: 'world'
  });
};
