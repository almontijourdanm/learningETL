'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('dukcapil', {
      nik: {
        type: Sequelize.STRING(32),
        allowNull: false,
        primaryKey: true,
      },
      nama: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      tanggal_lahir: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      alamat: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('dukcapil');
  },
};
