const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'EtlImportRun',
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      source_file: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      finished_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      total_rows: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      inserted_dukcapil: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      updated_dukcapil: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      affected_dukcapil: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      inserted_dpt: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      updated_dpt: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      affected_dpt: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      inserted_voting: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      skipped_rows: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      rows_without_nik: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      hadir_false_rows: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      invalid_flag_true_rows: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      invalid_voted_at_rows: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      voting_eligible_rows: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      voting_ineligible_rows: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      error_rows: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'etl_import_runs',
      freezeTableName: true,
      underscored: true,
      timestamps: true,
    }
  );
};
