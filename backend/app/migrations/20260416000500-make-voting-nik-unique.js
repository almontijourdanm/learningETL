'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM voting AS v
      USING voting AS dup
      WHERE v.nik = dup.nik
        AND v.ctid < dup.ctid;
    `);

    await queryInterface.removeIndex('voting', 'idx_voting_nik');

    await queryInterface.addIndex('voting', ['nik'], {
      name: 'idx_voting_nik_unique',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('voting', 'idx_voting_nik_unique');

    await queryInterface.addIndex('voting', ['nik'], {
      name: 'idx_voting_nik',
    });
  },
};
