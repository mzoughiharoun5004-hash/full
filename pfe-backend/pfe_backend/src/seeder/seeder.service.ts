import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from 'src/users/user.entity';
import { Role } from 'src/role/role.entity';
import { Scenario } from 'src/scenario/scenario.entity';
import { CourseModule } from 'src/course-module/course-module.entity';
import { Sequence } from 'src/sequence/sequence.entity';
import { Activite } from 'src/activite/activite.entity';
import { Quiz } from 'src/quiz/quiz.entity';
import { Question } from 'src/question/question.entity';
import { Reponse } from 'src/reponse/reponse.entity';
import { StatutScenario, TypeActivite, TypeQuestion } from 'src/common/enums';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Scenario)
    private readonly scenarioRepo: Repository<Scenario>,
    @InjectRepository(CourseModule)
    private readonly moduleRepo: Repository<CourseModule>,
    @InjectRepository(Sequence)
    private readonly sequenceRepo: Repository<Sequence>,
    @InjectRepository(Activite)
    private readonly activiteRepo: Repository<Activite>,
    @InjectRepository(Quiz)
    private readonly quizRepo: Repository<Quiz>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Reponse)
    private readonly reponseRepo: Repository<Reponse>,
  ) {}

  async onApplicationBootstrap() {
    try {
      // ── Roles ─────────────────────────────────────────────────────────────
      let adminRole = await this.roleRepo.findOne({ where: { name: 'admin' } });
      if (!adminRole) {
        adminRole = await this.roleRepo.save({ name: 'admin' });
        console.log(' Rôle admin créé');
      }

      let educatorRole = await this.roleRepo.findOne({
        where: { name: 'teacher' },
      });
      if (!educatorRole) {
        educatorRole = await this.roleRepo.save({ name: 'teacher' });
        console.log(' Rôle educator créé');
      }

      // ── Admin user ────────────────────────────────────────────────────────
      let admin = await this.userRepo.findOne({
        where: { email: 'admin@example.com' },
      });
      if (!admin) {
        admin = await this.userRepo.save({
          firstName: 'Administrateur',
          lastName: 'Administrateur',
          email: 'admin@example.com',
          password: await bcrypt.hash('Admin@123', 10),
          role: adminRole,
          dateInscription: new Date(),
        });
        console.log('Utilisateur admin créé');
      }

      // ── Educator user ─────────────────────────────────────────────────────
      let educator = await this.userRepo.findOne({
        where: { email: 'educator@example.com' },
      });
      if (!educator) {
        educator = await this.userRepo.save({
          lastName: 'Dupont',
          firstName: 'Jean',
          email: 'educator@example.com',
          password: await bcrypt.hash('Educator@123', 10),
          role: educatorRole,
          dateInscription: new Date(),
        });
        console.log(' Utilisateur educator créé');
      }

      // ── Sample Scenario ───────────────────────────────────────────────────
      const scenarioExists = await this.scenarioRepo.findOne({
        where: { titre: 'Introduction à TypeScript' },
      });
      if (scenarioExists) return; // Already seeded

      const scenario = await this.scenarioRepo.save({
        titre: 'Introduction à TypeScript',
        description: 'Un scénario complet pour apprendre TypeScript de zéro.',
        objectif: 'Maîtriser les bases du langage TypeScript.',
        niveau: 'débutant',
        dureeScenario: 180,
        statut: StatutScenario.BROUILLON,
        user: educator,
      });
      console.log(' Scénario exemple créé');

      // ── Module ────────────────────────────────────────────────────────────
      const module1 = await this.moduleRepo.save({
        titre: 'Module 1 - Fondamentaux',
        description: 'Types de base, variables et fonctions.',
        ordre: 1,
        duree: 60,
        scenario,
      });

      // ── Sequence ──────────────────────────────────────────────────────────
      const seq1 = await this.sequenceRepo.save({
        titre: 'Séquence 1 - Types primitifs',
        texte: 'Les types number, string, boolean, null et undefined.',
        duree: 20,
        module: module1,
      });

      // ── Activite ──────────────────────────────────────────────────────────
      const activite = await this.activiteRepo.save({
        titre: 'QCM - Les types primitifs',
        type: TypeActivite.QCM,
        consigne: 'Répondez aux 3 questions suivantes.',
        ordre: 1,
        sequence: seq1,
      });

      // ── Quiz ──────────────────────────────────────────────────────────────
      const quiz = await this.quizRepo.save({
        titre: 'Quiz TypeScript - Types',
        description: 'Testez vos connaissances sur les types TypeScript.',
        tentatives: 3,
        scorePourReussir: 60.0,
      });

      // Link quiz ↔ activite
      activite.quiz = quiz;
      await this.activiteRepo.save(activite);

      // ── Question 1 ────────────────────────────────────────────────────────
      const q1 = await this.questionRepo.save({
        titre: 'Quel est le type pour une chaîne de caractères ?',
        type: TypeQuestion.QCM,
        points: 2,
        ordre: 1,
        quiz,
      });
      await this.reponseRepo.save([
        {
          texte: 'string',
          estCorrect: true,
          feedback: 'Correct ! string est le type de base.',
          question: q1,
        },
        {
          texte: 'str',
          estCorrect: false,
          feedback: 'Incorrect. En TypeScript c\'est "string".',
          question: q1,
        },
        {
          texte: 'char',
          estCorrect: false,
          feedback: "Incorrect. TypeScript n'a pas de type char.",
          question: q1,
        },
      ]);

      // ── Question 2 ────────────────────────────────────────────────────────
      const q2 = await this.questionRepo.save({
        titre: 'TypeScript est un sur-ensemble de JavaScript.',
        type: TypeQuestion.VRAI_FAUX,
        points: 1,
        ordre: 2,
        quiz,
      });
      await this.reponseRepo.save([
        {
          texte: 'Vrai',
          estCorrect: true,
          feedback: 'Correct ! Tout code JS valide est du TS valide.',
          question: q2,
        },
        {
          texte: 'Faux',
          estCorrect: false,
          feedback: 'Incorrect.',
          question: q2,
        },
      ]);

      console.log(' Données de démonstration créées avec succès');
    } catch (error) {
      console.error(' Erreur lors du seeding :', error);
    }
  }
}
