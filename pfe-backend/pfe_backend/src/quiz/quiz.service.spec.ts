import { QuizService } from './quiz.service';

describe('QuizService', () => {
  it('loads a quiz through its linked activity id', async () => {
    const quizRepo = {
      findOne: jest.fn(() =>
        Promise.resolve({ id: 9, titre: 'Activity quiz' }),
      ),
    };
    const activiteRepo = {};
    const service = new QuizService(
      quizRepo as never,
      activiteRepo as never,
      null as never,
    );

    const quiz = await service.findByActivite(3);

    expect(quiz).toEqual({ id: 9, titre: 'Activity quiz' });
    expect(quizRepo.findOne).toHaveBeenCalledWith({
      where: { activite: { id: 3 } },
      relations: ['questions', 'questions.reponses', 'activite'],
    });
  });
});
