import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1790186962376 implements MigrationInterface {
    name = 'InitialSchema1790186962376'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "reponse" ("id" SERIAL NOT NULL, "texte" text NOT NULL, "estCorrect" boolean NOT NULL DEFAULT false, "feedback" text, "ordre" integer NOT NULL DEFAULT '0', "questionId" integer, CONSTRAINT "PK_0a0c336dee20b2e79067b38aaae" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."question_type_enum" AS ENUM('qcm', 'vrai_faux')`);
        await queryRunner.query(`CREATE TABLE "question" ("id" SERIAL NOT NULL, "titre" character varying NOT NULL, "type" "public"."question_type_enum" NOT NULL, "texte" text, "points" double precision NOT NULL DEFAULT '1', "ordre" integer NOT NULL DEFAULT '0', "quizId" integer, CONSTRAINT "PK_21e5786aa0ea704ae185a79b2d5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "quiz" ("id" SERIAL NOT NULL, "titre" character varying NOT NULL, "description" text, "tentatives" integer NOT NULL DEFAULT '1', "scorePourReussir" double precision NOT NULL DEFAULT '50', CONSTRAINT "PK_422d974e7217414e029b3e641d0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."activite_type_enum" AS ENUM('qcm', 'vml', 'exercice', 'discussion', 'appartement')`);
        await queryRunner.query(`CREATE TABLE "activite" ("id" SERIAL NOT NULL, "titre" character varying NOT NULL, "type" "public"."activite_type_enum" NOT NULL, "consigne" text, "code" text, "ordre" integer NOT NULL DEFAULT '0', "sequenceId" integer, "quizId" integer, CONSTRAINT "REL_b291b9087e8f8630ae01940de2" UNIQUE ("quizId"), CONSTRAINT "PK_c4f04c4217a4a990c0b0a762e61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "sequence" ("id" SERIAL NOT NULL, "titre" character varying NOT NULL, "texte" text, "description" text, "duree" integer, "ordre" integer NOT NULL DEFAULT '0', "moduleId" integer, CONSTRAINT "PK_775d7d43700407de90b5f0d7584" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."ressource_type_enum" AS ENUM('mass', 'video', 'audio', 'document', 'discussion')`);
        await queryRunner.query(`CREATE TABLE "ressource" ("id" SERIAL NOT NULL, "titre" character varying NOT NULL, "type" "public"."ressource_type_enum" NOT NULL, "url" character varying, "description" text, "taille" integer, "scenarioId" integer, "moduleId" integer, "uploadedById" integer, CONSTRAINT "PK_711d32849924a945bb78f54d7d7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "course_module" ("id" SERIAL NOT NULL, "titre" character varying NOT NULL, "description" text, "ordre" integer NOT NULL DEFAULT '0', "duree" integer, "scenarioId" integer, CONSTRAINT "PK_9d04c56010223c5997cc71093b4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."rapport_type_enum" AS ENUM('progression', 'evaluation', 'statistiques')`);
        await queryRunner.query(`CREATE TABLE "rapport" ("id" SERIAL NOT NULL, "type" "public"."rapport_type_enum" NOT NULL, "date" TIMESTAMP NOT NULL DEFAULT now(), "donnees" jsonb, "score" double precision, "userId" integer, "scenarioId" integer, CONSTRAINT "PK_4432bdd28fe2cafbfd98c419032" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."scenario_share_permission_enum" AS ENUM('view', 'edit')`);
        await queryRunner.query(`CREATE TYPE "public"."scenario_share_role_enum" AS ENUM('co_author', 'reviewer')`);
        await queryRunner.query(`CREATE TABLE "scenario_share" ("id" SERIAL NOT NULL, "permission" "public"."scenario_share_permission_enum" NOT NULL DEFAULT 'view', "role" "public"."scenario_share_role_enum" NOT NULL DEFAULT 'reviewer', "canEditStructure" boolean NOT NULL DEFAULT false, "canEditContent" boolean NOT NULL DEFAULT false, "canPublish" boolean NOT NULL DEFAULT false, "sharedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "scenarioId" integer, "sharedWithId" integer, CONSTRAINT "PK_2fccb00eb43acd0a7cd4dce8173" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."scenario_statut_enum" AS ENUM('brouillon', 'en_cours_validation', 'approuve', 'exporte', 'archive')`);
        await queryRunner.query(`CREATE TABLE "scenario" ("id" SERIAL NOT NULL, "titre" character varying NOT NULL, "description" text, "objectif" text, "niveau" character varying, "dureeScenario" integer, "statut" "public"."scenario_statut_enum" NOT NULL DEFAULT 'brouillon', "courseDocument" jsonb, "courseDocumentVersion" integer NOT NULL DEFAULT '1', "scenarioDocument" jsonb, "scenarioDocumentVersion" integer NOT NULL DEFAULT '1', "tone" character varying, "audience" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "approvedAt" TIMESTAMP, "userId" integer, CONSTRAINT "PK_ec7b57ee913fb77bb70ed3bc708" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_scenario_courseDocument_gin" ON "scenario" USING GIN ("courseDocument")`);
        await queryRunner.query(`CREATE TABLE "user" ("id" SERIAL NOT NULL, "lastName" character varying NOT NULL, "firstName" character varying NOT NULL, "email" character varying NOT NULL, "password" character varying NOT NULL, "dateInscription" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "lastLoginAt" TIMESTAMP, "previousLoginAt" TIMESTAMP, "roleId" integer, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "role" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_b36bcfe02fc8de3c57a8b2391c2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "scenario_activity_log" ("id" SERIAL NOT NULL, "action" character varying NOT NULL, "targetType" character varying, "targetId" character varying, "before" jsonb, "after" jsonb, "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "scenarioId" integer, "actorId" integer, CONSTRAINT "PK_01f415e4ffc267eeb260a6eea22" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."scenario_change_proposal_targettype_enum" AS ENUM('course', 'lesson', 'module')`);
        await queryRunner.query(`CREATE TYPE "public"."scenario_change_proposal_status_enum" AS ENUM('pending', 'approved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "scenario_change_proposal" ("id" SERIAL NOT NULL, "targetType" "public"."scenario_change_proposal_targettype_enum" NOT NULL, "targetId" character varying, "summary" text NOT NULL, "patch" jsonb, "status" "public"."scenario_change_proposal_status_enum" NOT NULL DEFAULT 'pending', "decisionNote" text, "reviewedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "scenarioId" integer, "proposerId" integer, "reviewerId" integer, CONSTRAINT "PK_5a75948f6f06de4455a7a11f623" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."scenario_comment_targettype_enum" AS ENUM('course', 'lesson', 'module')`);
        await queryRunner.query(`CREATE TYPE "public"."scenario_comment_status_enum" AS ENUM('open', 'resolved')`);
        await queryRunner.query(`CREATE TABLE "scenario_comment" ("id" SERIAL NOT NULL, "targetType" "public"."scenario_comment_targettype_enum" NOT NULL, "targetId" character varying, "body" text NOT NULL, "mentions" jsonb, "status" "public"."scenario_comment_status_enum" NOT NULL DEFAULT 'open', "resolvedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "scenarioId" integer, "authorId" integer, CONSTRAINT "PK_661f2e0e0082569d177a09fc6a0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ai_change_set" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" character varying(32) NOT NULL, "kind" character varying(32) NOT NULL, "instruction" text NOT NULL, "courseDocumentVersion" integer NOT NULL, "proposal" jsonb NOT NULL, "metadata" jsonb, "failureReason" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "scenarioId" integer, "requestedById" integer, CONSTRAINT "PK_3fe7f763f2d1bee6aeb629d6fe0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "reponse" ADD CONSTRAINT "FK_2c1112efbb37df10cabc28f5533" FOREIGN KEY ("questionId") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "question" ADD CONSTRAINT "FK_4959a4225f25d923111e54c7cd2" FOREIGN KEY ("quizId") REFERENCES "quiz"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activite" ADD CONSTRAINT "FK_d985198955beefb2cb64a2f3992" FOREIGN KEY ("sequenceId") REFERENCES "sequence"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activite" ADD CONSTRAINT "FK_b291b9087e8f8630ae01940de22" FOREIGN KEY ("quizId") REFERENCES "quiz"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sequence" ADD CONSTRAINT "FK_ecd0435a013bf030b7af07505e2" FOREIGN KEY ("moduleId") REFERENCES "course_module"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ressource" ADD CONSTRAINT "FK_daa4da3bec65177bf36f2e420a6" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ressource" ADD CONSTRAINT "FK_7befb61d69bb0d9472d35c6eff5" FOREIGN KEY ("moduleId") REFERENCES "course_module"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ressource" ADD CONSTRAINT "FK_766cbf70d788054fd57d574e10f" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "course_module" ADD CONSTRAINT "FK_e8187e1ed98b8f1383f79cd4be3" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rapport" ADD CONSTRAINT "FK_dce2ade30664acaeddd22ba05c9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rapport" ADD CONSTRAINT "FK_4d59f01b561eac23ad9b646473a" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scenario_share" ADD CONSTRAINT "FK_c53c0755550b373016b26d1962d" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scenario_share" ADD CONSTRAINT "FK_bd650762669435953e80e9582ad" FOREIGN KEY ("sharedWithId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scenario" ADD CONSTRAINT "FK_09ffbd65c9433635ecf14414ac8" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user" ADD CONSTRAINT "FK_c28e52f758e7bbc53828db92194" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scenario_activity_log" ADD CONSTRAINT "FK_f5ef564c740933a4f38a1d8707a" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scenario_activity_log" ADD CONSTRAINT "FK_5299aac7ccfec7323c6f8f53ef7" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scenario_change_proposal" ADD CONSTRAINT "FK_459752a605a84d0eb260a050048" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scenario_change_proposal" ADD CONSTRAINT "FK_6c190b27503613fc7320a538700" FOREIGN KEY ("proposerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scenario_change_proposal" ADD CONSTRAINT "FK_3e5d4b2a995f8fd0ea34de14e4f" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scenario_comment" ADD CONSTRAINT "FK_7b8c1b3f6b08aa1eccb404af23c" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scenario_comment" ADD CONSTRAINT "FK_d7195f850b5117669e14a3fa12a" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ai_change_set" ADD CONSTRAINT "FK_57c2d226d1f0183a30cc0893d92" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ai_change_set" ADD CONSTRAINT "FK_06caf7dac042ca9db411073e4a4" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_change_set" DROP CONSTRAINT "FK_06caf7dac042ca9db411073e4a4"`);
        await queryRunner.query(`ALTER TABLE "ai_change_set" DROP CONSTRAINT "FK_57c2d226d1f0183a30cc0893d92"`);
        await queryRunner.query(`ALTER TABLE "scenario_comment" DROP CONSTRAINT "FK_d7195f850b5117669e14a3fa12a"`);
        await queryRunner.query(`ALTER TABLE "scenario_comment" DROP CONSTRAINT "FK_7b8c1b3f6b08aa1eccb404af23c"`);
        await queryRunner.query(`ALTER TABLE "scenario_change_proposal" DROP CONSTRAINT "FK_3e5d4b2a995f8fd0ea34de14e4f"`);
        await queryRunner.query(`ALTER TABLE "scenario_change_proposal" DROP CONSTRAINT "FK_6c190b27503613fc7320a538700"`);
        await queryRunner.query(`ALTER TABLE "scenario_change_proposal" DROP CONSTRAINT "FK_459752a605a84d0eb260a050048"`);
        await queryRunner.query(`ALTER TABLE "scenario_activity_log" DROP CONSTRAINT "FK_5299aac7ccfec7323c6f8f53ef7"`);
        await queryRunner.query(`ALTER TABLE "scenario_activity_log" DROP CONSTRAINT "FK_f5ef564c740933a4f38a1d8707a"`);
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "FK_c28e52f758e7bbc53828db92194"`);
        await queryRunner.query(`ALTER TABLE "scenario" DROP CONSTRAINT "FK_09ffbd65c9433635ecf14414ac8"`);
        await queryRunner.query(`ALTER TABLE "scenario_share" DROP CONSTRAINT "FK_bd650762669435953e80e9582ad"`);
        await queryRunner.query(`ALTER TABLE "scenario_share" DROP CONSTRAINT "FK_c53c0755550b373016b26d1962d"`);
        await queryRunner.query(`ALTER TABLE "rapport" DROP CONSTRAINT "FK_4d59f01b561eac23ad9b646473a"`);
        await queryRunner.query(`ALTER TABLE "rapport" DROP CONSTRAINT "FK_dce2ade30664acaeddd22ba05c9"`);
        await queryRunner.query(`ALTER TABLE "course_module" DROP CONSTRAINT "FK_e8187e1ed98b8f1383f79cd4be3"`);
        await queryRunner.query(`ALTER TABLE "ressource" DROP CONSTRAINT "FK_766cbf70d788054fd57d574e10f"`);
        await queryRunner.query(`ALTER TABLE "ressource" DROP CONSTRAINT "FK_7befb61d69bb0d9472d35c6eff5"`);
        await queryRunner.query(`ALTER TABLE "ressource" DROP CONSTRAINT "FK_daa4da3bec65177bf36f2e420a6"`);
        await queryRunner.query(`ALTER TABLE "sequence" DROP CONSTRAINT "FK_ecd0435a013bf030b7af07505e2"`);
        await queryRunner.query(`ALTER TABLE "activite" DROP CONSTRAINT "FK_b291b9087e8f8630ae01940de22"`);
        await queryRunner.query(`ALTER TABLE "activite" DROP CONSTRAINT "FK_d985198955beefb2cb64a2f3992"`);
        await queryRunner.query(`ALTER TABLE "question" DROP CONSTRAINT "FK_4959a4225f25d923111e54c7cd2"`);
        await queryRunner.query(`ALTER TABLE "reponse" DROP CONSTRAINT "FK_2c1112efbb37df10cabc28f5533"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_scenario_courseDocument_gin"`);
        await queryRunner.query(`DROP TABLE "ai_change_set"`);
        await queryRunner.query(`DROP TABLE "scenario_comment"`);
        await queryRunner.query(`DROP TYPE "public"."scenario_comment_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."scenario_comment_targettype_enum"`);
        await queryRunner.query(`DROP TABLE "scenario_change_proposal"`);
        await queryRunner.query(`DROP TYPE "public"."scenario_change_proposal_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."scenario_change_proposal_targettype_enum"`);
        await queryRunner.query(`DROP TABLE "scenario_activity_log"`);
        await queryRunner.query(`DROP TABLE "role"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`DROP TABLE "scenario"`);
        await queryRunner.query(`DROP TYPE "public"."scenario_statut_enum"`);
        await queryRunner.query(`DROP TABLE "scenario_share"`);
        await queryRunner.query(`DROP TYPE "public"."scenario_share_role_enum"`);
        await queryRunner.query(`DROP TYPE "public"."scenario_share_permission_enum"`);
        await queryRunner.query(`DROP TABLE "rapport"`);
        await queryRunner.query(`DROP TYPE "public"."rapport_type_enum"`);
        await queryRunner.query(`DROP TABLE "course_module"`);
        await queryRunner.query(`DROP TABLE "ressource"`);
        await queryRunner.query(`DROP TYPE "public"."ressource_type_enum"`);
        await queryRunner.query(`DROP TABLE "sequence"`);
        await queryRunner.query(`DROP TABLE "activite"`);
        await queryRunner.query(`DROP TYPE "public"."activite_type_enum"`);
        await queryRunner.query(`DROP TABLE "quiz"`);
        await queryRunner.query(`DROP TABLE "question"`);
        await queryRunner.query(`DROP TYPE "public"."question_type_enum"`);
        await queryRunner.query(`DROP TABLE "reponse"`);
    }

}
