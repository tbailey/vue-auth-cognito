'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = actionsFactory;

var _amazonCognitoIdentityJs = require('amazon-cognito-identity-js');

var _mutationTypes = require('./mutation-types');

var types = _interopRequireWildcard(_mutationTypes);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var cloneDeep = require('lodash.clonedeep');


function constructUser(cognitoUser, session) {
  return {
    username: cognitoUser.getUsername(),
    tokens: {
      IdToken: session.getIdToken().getJwtToken(),
      AccessToken: session.getAccessToken().getJwtToken(),
      RefreshToken: session.getRefreshToken().getToken(),
      RefreshTokenObj: session.getRefreshToken()
    },
    expiration: session.getAccessToken().getExpiration(),
    attributes: {}
  };
}

// cannot use ES6 classes, the methods are not enumerable, properties are.
function actionsFactory(config) {
  var cognitoUserPool = new _amazonCognitoIdentityJs.CognitoUserPool({
    UserPoolId: config.UserPoolId,
    ClientId: config.ClientId,
    Paranoia: 6
  });

  return {
    getCurrentUser: function getCurrentUser(_ref) {
      var commit = _ref.commit;

      return new Promise(function (resolve, reject) {
        var cognitoUser = cognitoUserPool.getCurrentUser();

        if (!cognitoUser) {
          reject({
            message: "Can't retrieve the current user"
          });
          return;
        }

        cognitoUser.getSession(function (err, session) {
          if (err) {
            reject(err);
            return;
          }

          var constructedUser = constructUser(cognitoUser, session);
          // Call AUTHENTICATE because it's utterly the same
          commit(types.AUTHENTICATE, constructedUser);
          resolve(constructedUser);
        });
      });
    },
    authenticateUser: function authenticateUser(_ref2, payload) {
      var commit = _ref2.commit;

      var authDetails = new _amazonCognitoIdentityJs.AuthenticationDetails({
        Username: payload.username,
        Password: payload.password
      });

      var cognitoUser = new _amazonCognitoIdentityJs.CognitoUser({
        Pool: cognitoUserPool,
        Username: payload.username
      });

      return new Promise(function (resolve, reject) {
        return cognitoUser.authenticateUser(authDetails, {
          onFailure: function onFailure(err) {
            reject(err);
          },
          onSuccess: function onSuccess(session) {
            commit(types.AUTHENTICATE, constructUser(cognitoUser, session));
            resolve({ userConfirmationNecessary: false });
          },
          mfaRequired: function mfaRequired(codeDeliveryDetails) {
            // @todo MFA not implemented yet
            // MFA Needs a sendMFACode function similar to completeNewPasswordChallenge
            // MFA is required to complete user authentication.
            // Get the code from user and call
            // cognitoUser.sendMFACode(mfaCode, this)
          },

          newPasswordRequired: function newPasswordRequired(userAttributes, requiredAttributes) {
            // User was signed up by an admin and must provide new
            // password and required attributes, if any, to complete
            // authentication.

            // userAttributes: object, which is the user's current profile. It will list all attributes that are associated with the user.
            // Required attributes according to schema, which don’t have any values yet, will have blank values.
            // requiredAttributes: list of attributes that must be set by the user along with new password to complete the sign-in.

            // Get the new password and any required attributes into a format similar to userAttributes
            // Then call completeNewPasswordChallenge

            delete userAttributes.email_verified; // it's returned but not valid to submit

            //Store the cognitoUser object in order to reuse it
            commit(types.COGNITOUSER, cognitoUser);

            resolve({ userConfirmationNecessary: true, userAttributes: userAttributes, requiredAttributes: requiredAttributes });
          }
        });
      });
    },
    completeNewPasswordChallenge: function completeNewPasswordChallenge(_ref3, payload) {
      var commit = _ref3.commit,
          state = _ref3.state;

      console.log('in-function');
      // const cognitoUser = Object.assign({}, state.cognito.cognitoUser);
      var cognitoUser = cloneDeep(state.cognitoUser);
      // const cognitoUser = state.cognitoUser

      return new Promise(function (resolve, reject) {
        if (cognitoUser === null) {
          reject({
            message: 'User is unauthenticated'
          });
          return;
        }

        cognitoUser.completeNewPasswordChallenge(payload.newPassword, payload.userAttributes, {
          onFailure: function onFailure(err) {
            // console.log(err);
            reject(err);
          },
          onSuccess: function onSuccess(session) {
            commit(types.AUTHENTICATE, constructUser(cognitoUser, session));
            commit(types.REMOVECOGNITOUSER);
            resolve();
          }
        });
      });
    },
    signUp: function signUp(_ref4, userInfo) {
      var commit = _ref4.commit;

      /* userInfo: { username, password, attributes } */
      var userAttributes = Object.keys(userInfo.attributes || {}).map(function (key) {
        return new _amazonCognitoIdentityJs.CognitoUserAttribute({
          Name: key,
          Value: userInfo.attributes[key]
        });
      });

      return new Promise(function (resolve, reject) {
        cognitoUserPool.signUp(userInfo.username, userInfo.password, userAttributes, null, function (err, data) {
          if (!err) {
            commit(types.AUTHENTICATE, {
              username: data.user.getUsername(),
              tokens: null, // no session yet
              attributes: {}
            });
            resolve({ userConfirmationNecessary: !data.userConfirmed });
            return;
          }
          reject(err);
        });
      });
    },
    confirmRegistration: function confirmRegistration(_ref5, payload) {
      var state = _ref5.state;

      var cognitoUser = new _amazonCognitoIdentityJs.CognitoUser({
        Pool: cognitoUserPool,
        Username: payload.username
      });

      return new Promise(function (resolve, reject) {
        cognitoUser.confirmRegistration(payload.code, true, function (err) {
          if (!err) {
            resolve();
            return;
          }
          reject(err);
        });
      });
    },
    resendConfirmationCode: function resendConfirmationCode(_ref6, payload) {
      var commit = _ref6.commit;

      var cognitoUser = new _amazonCognitoIdentityJs.CognitoUser({
        Pool: cognitoUserPool,
        Username: payload.username
      });

      return new Promise(function (resolve, reject) {
        cognitoUser.resendConfirmationCode(function (err) {
          if (!err) {
            resolve();
            return;
          }
          reject(err);
        });
      });
    },
    forgotPassword: function forgotPassword(_ref7, payload) {
      var commit = _ref7.commit;

      var cognitoUser = new _amazonCognitoIdentityJs.CognitoUser({
        Pool: cognitoUserPool,
        Username: payload.username
      });

      return new Promise(function (resolve, reject) {
        return cognitoUser.forgotPassword({
          onSuccess: function onSuccess() {
            resolve();
          },
          onFailure: function onFailure(err) {
            reject(err);
          }
        });
      });
    },
    confirmPassword: function confirmPassword(_ref8, payload) {
      var commit = _ref8.commit;

      var cognitoUser = new _amazonCognitoIdentityJs.CognitoUser({
        Pool: cognitoUserPool,
        Username: payload.username
      });

      return new Promise(function (resolve, reject) {
        cognitoUser.confirmPassword(payload.code, payload.newPassword, {
          onFailure: function onFailure(err) {
            reject(err);
          },
          onSuccess: function onSuccess() {
            resolve();
          }
        });
      });
    },


    // Only for authenticated users
    changePassword: function changePassword(_ref9, payload) {
      var state = _ref9.state;

      return new Promise(function (resolve, reject) {
        // Make sure the user is authenticated
        if (state.user === null || state.user && state.user.tokens === null) {
          reject({
            message: 'User is unauthenticated'
          });
          return;
        }

        var cognitoUser = new _amazonCognitoIdentityJs.CognitoUser({
          Pool: cognitoUserPool,
          Username: state.user.username
        });

        // Restore session without making an additional call to API
        cognitoUser.signInUserSession = cognitoUser.getCognitoUserSession(state.user.tokens);

        cognitoUser.changePassword(payload.oldPassword, payload.newPassword, function (err) {
          if (!err) {
            resolve();
            return;
          }
          reject(err);
        });
      });
    },


    // Only for authenticated users
    refreshSession: function refreshSession(_ref10) {
      var commit = _ref10.commit,
          state = _ref10.state;

      var refreshToken = state.user.tokens.RefreshTokenObj;

      var cognitoUser = new _amazonCognitoIdentityJs.CognitoUser({
        Pool: cognitoUserPool,
        Username: state.user.username
      });

      // Restore session without making an additional call to API
      cognitoUser.signInUserSession = cognitoUser.getCognitoUserSession(state.user.tokens);

      return new Promise(function (resolve, reject) {
        return cognitoUser.refreshSession(refreshToken, function (err, session) {
          if (!err) {
            commit(types.AUTHENTICATE, constructUser(cognitoUser, session));
            resolve();
            return;
          }
          reject(err);
        });
      });
    },


    // Only for authenticated users
    updateAttributes: function updateAttributes(_ref11, payload) {
      var commit = _ref11.commit,
          state = _ref11.state;

      return new Promise(function (resolve, reject) {
        // Make sure the user is authenticated
        if (state.user === null || state.user && state.user.tokens === null) {
          reject({
            message: 'User is unauthenticated'
          });
          return;
        }

        var cognitoUser = new _amazonCognitoIdentityJs.CognitoUser({
          Pool: cognitoUserPool,
          Username: state.user.username
        });

        // Restore session without making an additional call to API
        cognitoUser.signInUserSession = cognitoUser.getCognitoUserSession(state.user.tokens);

        var attributes = Object.keys(payload || {}).map(function (key) {
          return new _amazonCognitoIdentityJs.CognitoUserAttribute({
            Name: key,
            Value: payload[key]
          });
        });

        cognitoUser.updateAttributes(attributes, function (err) {
          if (!err) {
            resolve();
            return;
          }
          reject(err);
        });
      });
    },


    // Only for authenticated users
    getUserAttributes: function getUserAttributes(_ref12) {
      var commit = _ref12.commit,
          state = _ref12.state;

      return new Promise(function (resolve, reject) {
        // Make sure the user is authenticated
        if (state.user === null || state.user && state.user.tokens === null) {
          reject({
            message: 'User is unauthenticated'
          });
          return;
        }

        var cognitoUser = new _amazonCognitoIdentityJs.CognitoUser({
          Pool: cognitoUserPool,
          Username: state.user.username
        });

        // Restore session without making an additional call to API
        cognitoUser.signInUserSession = cognitoUser.getCognitoUserSession(state.user.tokens);

        cognitoUser.getUserAttributes(function (err, attributes) {
          if (err) {
            reject(err);
            return;
          }

          var attributesMap = (attributes || []).reduce(function (accum, item) {
            accum[item.Name] = item.Value;
            return accum;
          }, {});

          commit(types.ATTRIBUTES, attributesMap);
          resolve(attributesMap);
        });
      });
    },


    // Only for authenticated users
    signOut: function signOut(_ref13) {
      var commit = _ref13.commit,
          state = _ref13.state;

      return new Promise(function (resolve, reject) {
        // Make sure the user is authenticated
        if (state.user === null || state.user && state.user.tokens === null) {
          reject({
            message: 'User is unauthenticated'
          });
          return;
        }

        var cognitoUser = new _amazonCognitoIdentityJs.CognitoUser({
          Pool: cognitoUserPool,
          Username: state.user.username
        });

        cognitoUser.signOut();
        commit(types.SIGNOUT);
        resolve();
      });
    }
  };
}