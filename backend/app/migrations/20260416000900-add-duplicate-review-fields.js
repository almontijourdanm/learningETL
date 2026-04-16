'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('etl_duplicate_candidates', 'reviewer_note', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('etl_duplicate_candidates', 'reviewed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addIndex('etl_duplicate_candidates', ['review_status'], {
      name: 'idx_etl_duplicate_candidates_review_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('etl_duplicate_candidates', 'idx_etl_duplicate_candidates_review_status');
    await queryInterface.removeColumn('etl_duplicate_candidates', 'reviewed_at');
    await queryInterface.removeColumn('etl_duplicate_candidates', 'reviewer_note');
  },
};
