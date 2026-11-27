/**
 * `/api/v1` router. Everything here requires a session or bearer token.
 * Signed media delivery lives outside this router at `/stream` and `/artwork`
 * so native audio elements never need a custom Authorization header.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use('/me', require('./me'));
router.use('/tracks', require('./tracks'));
router.use('/playlists', require('./playlists'));
router.use('/player', require('./player'));
router.use('/ingest', require('./ingest'));
router.use('/integrations', require('./integrations'));
router.use('/ha', require('./homeAssistant'));
router.use('/users', require('./users'));
router.use('/admin', require('./admin'));
router.use('/account', require('./account'));
router.use('/onboarding', require('./onboarding'));
router.use('/notifications', require('./notifications'));

module.exports = router;
