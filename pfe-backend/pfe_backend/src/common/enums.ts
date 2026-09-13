export enum StatutScenario {
  BROUILLON = 'brouillon',
  EN_COURS_VALIDATION = 'en_cours_validation',
  APPROUVE = 'approuve',
  EXPORTE = 'exporte',
  ARCHIVE = 'archive',
}

export function isApprovedScenarioStatut(statut: StatutScenario): boolean {
  return (
    statut === StatutScenario.APPROUVE || statut === StatutScenario.EXPORTE
  );
}

export enum TypeRessource {
  MASS = 'mass',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  DISCUSSION = 'discussion',
}

export enum TypeActivite {
  QCM = 'qcm',
  VML = 'vml',
  EXERCICE = 'exercice',
  DISCUSSION = 'discussion',
  APPARTEMENT = 'appartement',
}

export enum TypeQuestion {
  QCM = 'qcm',
  VRAI_FAUX = 'vrai_faux',
}

export enum TypeRapport {
  PROGRESSION = 'progression',
  EVALUATION = 'evaluation',
  STATISTIQUES = 'statistiques',
}
