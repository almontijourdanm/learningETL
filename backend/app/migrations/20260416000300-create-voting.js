'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('voting', {
      id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      nik: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      voted_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('voting', ['nik'], {
      name: 'idx_voting_nik',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('voting');
  },
};
