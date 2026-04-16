const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Dukcapil',
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
      tanggal_lahir: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      alamat: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'dukcapil',
      timestamps: false,
      freezeTableName: true,
    }
  );
};
