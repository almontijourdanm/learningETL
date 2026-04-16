'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('etl_duplicate_candidates', {
      id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      import_run_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'etl_import_runs',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      source_nik: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      matched_nik: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      source_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      matched_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      source_address: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      matched_address: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      similarity_score: {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: false,
      },
      match_reason: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      review_status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
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

    await queryInterface.addIndex('etl_duplicate_candidates', ['import_run_id'], {
      name: 'idx_etl_duplicate_candidates_import_run_id',
    });

    await queryInterface.addIndex('etl_duplicate_candidates', ['similarity_score'], {
      name: 'idx_etl_duplicate_candidates_similarity_score',
    });

    await queryInterface.addConstraint('etl_duplicate_candidates', {
      fields: ['import_run_id', 'source_nik', 'matched_nik'],
      type: 'unique',
      name: 'uq_etl_duplicate_candidates_pair_per_run',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('etl_duplicate_candidates');
  },
};
