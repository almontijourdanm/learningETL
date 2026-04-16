const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'EtlDuplicateCandidate',
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      import_run_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      source_nik: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      matched_nik: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      source_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      matched_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      source_address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      matched_address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      similarity_score: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
      },
      match_reason: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      review_status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
    },
    {
      tableName: 'etl_duplicate_candidates',
      freezeTableName: true,
      underscored: true,
      timestamps: true,
    }
  );
};
