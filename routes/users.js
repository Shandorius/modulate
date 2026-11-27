const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

router.get('/directory', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, display_name, email
       FROM users
       WHERE id <> $1
       ORDER BY lower(COALESCE(display_name, email)), created_at`,
      [req.user.id],
    );
    res.json({
      data: rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        email: row.email,
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
