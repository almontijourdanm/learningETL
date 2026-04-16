const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Voting',
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      nik: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      voted_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: 'voting',
      timestamps: false,
      freezeTableName: true,
    }
  );
};
