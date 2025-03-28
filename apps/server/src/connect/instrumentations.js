/* eslint-disable @typescript-eslint/no-var-requires */
import { ApiEndpoints } from '../shared/connect/ApiEndpoint.js'

export default function (app) {
  app.post('/feature_visits', async (req, res) => {
    res.sendStatus(200)
  })
  app.get(ApiEndpoints.AGREEMENT, async (req, res) => {
    res.send('')
  })
  app.get('/offers/*', async (req, res) => {
    res.send('')
  })
  app.get(ApiEndpoints.USER_FEATURES, async (req, res) => {
    res.send(require('./stubs/user_features.js'))
  })
  app.get(ApiEndpoints.TRANSACTION_RULES, async (req, res) => {
    res.send(require('./stubs/transaction_rules.js'))
  })
  app.get('/raja/data', async (req, res) => {
    const data = require('./stubs/data_master.js');
    data.user_profile.guid = req.context.user_id
    data.user_profile.user_guid = req.context.resolved_user_id
    res.send(data)
  })
  app.get('/raja/extend_session', async (req, res) => {
    res.sendStatus(200)
  })
}
