'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('etl_import_runs', {
      id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      source_file: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      total_rows: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      inserted_dukcapil: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      inserted_dpt: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      inserted_voting: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      skipped_rows: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      error_rows: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('etl_import_runs', ['status'], {
      name: 'idx_etl_import_runs_status',
    });

    await queryInterface.addIndex('etl_import_runs', ['started_at'], {
      name: 'idx_etl_import_runs_started_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('etl_import_runs');
  },
};
