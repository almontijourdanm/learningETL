'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('etl_import_runs', 'updated_dukcapil', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('etl_import_runs', 'affected_dukcapil', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('etl_import_runs', 'updated_dpt', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('etl_import_runs', 'affected_dpt', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('etl_import_runs', 'rows_without_nik', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('etl_import_runs', 'hadir_false_rows', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('etl_import_runs', 'invalid_flag_true_rows', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('etl_import_runs', 'invalid_voted_at_rows', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('etl_import_runs', 'voting_eligible_rows', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('etl_import_runs', 'voting_ineligible_rows', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('etl_import_runs', 'voting_ineligible_rows');
    await queryInterface.removeColumn('etl_import_runs', 'voting_eligible_rows');
    await queryInterface.removeColumn('etl_import_runs', 'invalid_voted_at_rows');
    await queryInterface.removeColumn('etl_import_runs', 'invalid_flag_true_rows');
    await queryInterface.removeColumn('etl_import_runs', 'hadir_false_rows');
    await queryInterface.removeColumn('etl_import_runs', 'rows_without_nik');
    await queryInterface.removeColumn('etl_import_runs', 'affected_dpt');
    await queryInterface.removeColumn('etl_import_runs', 'updated_dpt');
    await queryInterface.removeColumn('etl_import_runs', 'affected_dukcapil');
    await queryInterface.removeColumn('etl_import_runs', 'updated_dukcapil');
  },
};
