'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('dpt', {
      nik: {
        type: Sequelize.STRING(32),
        allowNull: false,
        primaryKey: true,
      },
      nama: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      tps_id: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      wilayah: {
        type: Sequelize.STRING,
        allowNull: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('dpt');
  },
};
