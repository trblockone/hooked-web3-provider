

"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var factory = function factory(Web3) {
  var HookedWeb3Provider = function (_Web3$providers$HttpP) {
    _inherits(HookedWeb3Provider, _Web3$providers$HttpP);

    function HookedWeb3Provider(_ref) {
      var host = _ref.host;
      var transaction_signer = _ref.transaction_signer;

      _classCallCheck(this, HookedWeb3Provider);

      var _this = _possibleConstructorReturn(this, (HookedWeb3Provider.__proto__ || Object.getPrototypeOf(HookedWeb3Provider)).call(this, host));

      _this.transaction_signer = transaction_signer;

      // Cache of the most up to date transaction counts (nonces) for each address
      // encountered by the web3 provider that's managed by the transaction signer.
      _this.global_nonces = {};
      return _this;
    }

    // We can't support *all* synchronous methods because we have to call out to
    // a transaction signer. So removing the ability to serve any.


    _createClass(HookedWeb3Provider, [{
      key: "send",
      value: function send(payload, callback) {
        var _this2 = this;

        var requests = payload;
        if (!(requests instanceof Array)) {
          requests = [requests];
        }

        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = requests[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var request = _step.value;

            if (request.method == "eth_sendTransaction") {
              throw new Error("HookedWeb3Provider does not support synchronous transactions. Please provide a callback.");
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        var finishedWithRewrite = function finishedWithRewrite(err) {
          if (err) return callback(err);
          return _get(HookedWeb3Provider.prototype.__proto__ || Object.getPrototypeOf(HookedWeb3Provider.prototype), "send", _this2).call(_this2, payload, callback);
        };

        return this.rewritePayloads(0, requests, {}, finishedWithRewrite);
      }

      // Catch the requests at the sendAsync level, rewriting all sendTransaction
      // methods to sendRawTransaction, calling out to the transaction_signer to
      // get the data for sendRawTransaction.

    }, {
      key: "sendAsync",
      value: function sendAsync(payload, callback) {
        var _this3 = this;

        var finishedWithRewrite = function finishedWithRewrite(err) {
          if (err) return callback(err);
          _get(HookedWeb3Provider.prototype.__proto__ || Object.getPrototypeOf(HookedWeb3Provider.prototype), "sendAsync", _this3).call(_this3, payload, callback);
        };

        var requests = payload;

        if (!(payload instanceof Array)) {
          requests = [payload];
        }

        this.rewritePayloads(0, requests, {}, finishedWithRewrite);
      }

      // Rewrite all eth_sendTransaction payloads in the requests array.
      // This takes care of batch requests, and updates the nonces accordingly.

    }, {
      key: "rewritePayloads",
      value: function rewritePayloads(index, requests, session_nonces, finished) {
        var _this4 = this;

        if (index >= requests.length) {
          return finished();
        }

        var payload = requests[index];

        // Function to remove code duplication for going to the next payload
        var next = function next(err) {
          if (err != null) {
            return finished(err);
          }
          return _this4.rewritePayloads(index + 1, requests, session_nonces, finished);
        };

        // If this isn't a transaction we can modify, ignore it.
        if (payload.method != "eth_sendTransaction") {
          return next();
        }

        var tx_params = payload.params[0];
        var sender = tx_params.from;

        this.transaction_signer.hasAddress(sender, function (err, has_address) {
          if (err != null || has_address == false) {
            return next(err);
          }

          // Get the nonce, requesting from web3 if we haven't already requested it in this session.
          // Remember: "session_nonces" is the nonces we know about for this batch of rewriting (this "session").
          //           Having this cache makes it so we only need to call getTransactionCount once per batch.
          //           "global_nonces" is nonces across the life of this provider.
          var getNonce = function getNonce(done) {
            // If a nonce is specified in our nonce list, use that nonce.
            var nonce = session_nonces[sender];
            if (nonce != null) {
              done(null, nonce);
            } else {
              // Include pending transactions, so the nonce is set accordingly.
              // Note: "pending" doesn't seem to take effect for some Ethereum clients (geth),
              // hence the need for global_nonces.
              // We call directly to our own sendAsync method, because the web3 provider
              // is not guaranteed to be set.
              _this4.sendAsync({
                jsonrpc: '2.0',
                method: 'eth_getTransactionCount',
                params: [sender, "pending"],
                id: new Date().getTime()
              }, function (err, result) {
                if (err != null) {
                  done(err);
                } else {
                  var new_nonce = result.result;
                  done(null, Web3.prototype.toDecimal(new_nonce));
                }
              });
            }
          };

          // Get the nonce, requesting from web3 if we need to.
          // We then store the nonce and update it so we don't have to
          // to request from web3 again.
          getNonce(function (err, nonce) {
            if (err != null) {
              return finished(err);
            }

            // Set the expected nonce, and update our caches of nonces.
            // Note that if our session nonce is lower than what we have cached
            // across all transactions (and not just this batch) use our cached
            // version instead, even if
            var final_nonce = Math.max(nonce, _this4.global_nonces[sender] || 0);

            // Update the transaction parameters.
            tx_params.nonce = Web3.prototype.toHex(final_nonce);

            // Update caches.
            session_nonces[sender] = final_nonce + 1;
            _this4.global_nonces[sender] = final_nonce + 1;

            // If our transaction signer does represent the address,
            // sign the transaction ourself and rewrite the payload.
            _this4.transaction_signer.signTransaction(tx_params, function (err, raw_tx) {
              if (err != null) {
                return next(err);
              }

              payload.method = "eth_sendRawTransaction";
              payload.params = [raw_tx];
              return next();
            });
          });
        });
      }

      /**
       * Override of HttpProvider - injects BlockOne token if present
       *
       * @method prepareRequest
       * @param {Boolean} true if request should be async
       * @return {XMLHttpRequest} object
       */

    }, {
      key: "prepareRequest",
      value: function prepareRequest(async) {
        var request = _get(HookedWeb3Provider.prototype.__proto__ || Object.getPrototypeOf(HookedWeb3Provider.prototype), "prepareRequest", this).call(this, async);
        if (!this.host.match(/^https:/)) {
          // console.error("Refusing to send auth token over insecure connection");
          return request;
        }
        var token;
        try {
          if (!sessionStorage.getItem('INJECT_AUTH')) throw null;
          var t = sessionStorage.getItem('AUTHBAR.TOKEN');
          token = JSON.parse(t).blockone;
        } catch (dummy) {}

        if (!token) {
          try {
            if (!process.env.INJECT_AUTH) throw null;
            token = process.env.WALLET_TOKEN;
          } catch (dummy) {}
        }

        if (token) {
          request.setRequestHeader('Authorization', 'Bearer ' + token);
        } else {
          // console.error("No token found in sessionStorage AUTHBAR.TOKEN or env.WALLET_TOKEN so sending request without token");
        }
        return request;
      }
    }]);

    return HookedWeb3Provider;
  }(Web3.providers.HttpProvider);

  return HookedWeb3Provider;
};

if (typeof module !== 'undefined') {
  module.exports = factory(require("web3"));
} else {
  window.HookedWeb3Provider = factory(Web3);
}