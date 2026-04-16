const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Dpt',
    {
      nik: {
        type: DataTypes.STRING(32),
        allowNull: false,
        primaryKey: true,
      },
      nama: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      tps_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      wilayah: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'dpt',
      timestamps: false,
      freezeTableName: true,
    }
  );
};
