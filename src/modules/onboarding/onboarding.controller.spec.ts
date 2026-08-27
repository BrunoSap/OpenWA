import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let mockOnboardingService: any;

  beforeEach(async () => {
    mockOnboardingService = {
      getState: jest.fn(),
      advanceStep: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [{ provide: OnboardingService, useValue: mockOnboardingService }],
    }).compile();

    controller = module.get<OnboardingController>(OnboardingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getState', () => {
    it('should call onboardingService.getState', async () => {
      const mockState = {
        currentStep: 'welcome',
        completedSteps: [],
        metadata: {},
      };

      mockOnboardingService.getState.mockResolvedValue(mockState);

      const result = await controller.getState('tenant-id');

      expect(mockOnboardingService.getState).toHaveBeenCalledWith('tenant-id');
      expect(result).toEqual(mockState);
    });
  });

  describe('advanceStep', () => {
    it('should call onboardingService.advanceStep', async () => {
      const mockState = {
        currentStep: 'whatsapp',
        completedSteps: ['welcome'],
        metadata: {},
      };

      mockOnboardingService.advanceStep.mockResolvedValue(mockState);

      const result = await controller.advanceStep('tenant-id', { step: 'welcome' });

      expect(mockOnboardingService.advanceStep).toHaveBeenCalledWith('tenant-id', 'welcome');
      expect(result).toEqual(mockState);
    });
  });
});
