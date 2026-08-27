import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnboardingService, OnboardingStep } from './onboarding.service';
import { OnboardingState } from './entities/onboarding-state.entity';
import { TenantService } from '../tenant/tenant.service';
import { SessionService } from '../session/session.service';
import { SessionStatus } from '../session/entities/session.entity';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let mockOnboardingRepo: any;
  let mockTenantService: any;
  let mockSessionService: any;

  beforeEach(async () => {
    mockOnboardingRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data })), // Return a copy to avoid mutation issues
      save: jest.fn((entity) => Promise.resolve({ ...entity })), // Return a copy
    };

    mockTenantService = {
      findById: jest.fn(),
    };

    mockSessionService = {
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getRepositoryToken(OnboardingState, 'main'), useValue: mockOnboardingRepo },
        { provide: TenantService, useValue: mockTenantService },
        { provide: SessionService, useValue: mockSessionService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getState', () => {
    it('should return existing state', async () => {
      const mockState = {
        id: 'state-id',
        tenantId: 'tenant-id',
        currentStep: 'whatsapp',
        completedSteps: ['welcome'],
        metadata: {},
      };

      mockOnboardingRepo.findOne.mockResolvedValue(mockState);

      const result = await service.getState('tenant-id');

      expect(result).toEqual({
        currentStep: 'whatsapp',
        completedSteps: ['welcome'],
        metadata: {},
      });
    });

    it('should return default state if not found', async () => {
      mockOnboardingRepo.findOne.mockResolvedValue(null);

      const result = await service.getState('tenant-id');

      expect(result).toEqual({
        currentStep: 'welcome',
        completedSteps: [],
        metadata: {},
      });
    });
  });

  describe('advanceStep', () => {
    it('should throw NotFoundException if tenant does not exist', async () => {
      mockTenantService.findById.mockResolvedValue(null);

      await expect(service.advanceStep('tenant-id', 'welcome')).rejects.toThrow(NotFoundException);
    });

    it('should create initial state if not exists', async () => {
      mockTenantService.findById.mockResolvedValue({ id: 'tenant-id', name: 'Test' });
      mockOnboardingRepo.findOne.mockResolvedValue(null);
      mockSessionService.findAll.mockResolvedValue([]); // welcome step always passes

      const result = await service.advanceStep('tenant-id', 'welcome');

      // Verify initial state was created with expected structure
      expect(mockOnboardingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-id',
          currentStep: 'welcome',
        }),
      );
      // Verify state was saved twice (create + advance)
      expect(mockOnboardingRepo.save).toHaveBeenCalledTimes(2);
      // Verify result shows advancement
      expect(result.currentStep).toBe('whatsapp');
      expect(result.completedSteps).toContain('welcome');
    });

    it('should throw BadRequestException if step mismatch', async () => {
      mockTenantService.findById.mockResolvedValue({ id: 'tenant-id', name: 'Test' });
      mockOnboardingRepo.findOne.mockResolvedValue({
        currentStep: 'whatsapp',
        completedSteps: ['welcome'],
        metadata: {},
      });

      await expect(service.advanceStep('tenant-id', 'welcome')).rejects.toThrow(BadRequestException);
      await expect(service.advanceStep('tenant-id', 'welcome')).rejects.toThrow(
        "Cannot advance from step 'welcome' - current step is 'whatsapp'",
      );
    });

    it('should advance from welcome to whatsapp', async () => {
      mockTenantService.findById.mockResolvedValue({ id: 'tenant-id', name: 'Test' });
      mockOnboardingRepo.findOne.mockResolvedValue({
        tenantId: 'tenant-id',
        currentStep: 'welcome',
        completedSteps: [],
        metadata: {},
      });

      const result = await service.advanceStep('tenant-id', 'welcome');

      expect(result.currentStep).toBe('whatsapp');
      expect(result.completedSteps).toContain('welcome');
      expect(mockOnboardingRepo.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if validation fails', async () => {
      mockTenantService.findById.mockResolvedValue({ id: 'tenant-id', name: 'Test' });
      mockOnboardingRepo.findOne.mockResolvedValue({
        tenantId: 'tenant-id',
        currentStep: 'whatsapp',
        completedSteps: ['welcome'],
        metadata: {},
      });
      mockSessionService.findAll.mockResolvedValue([]); // No ready session

      await expect(service.advanceStep('tenant-id', 'whatsapp')).rejects.toThrow(BadRequestException);
      await expect(service.advanceStep('tenant-id', 'whatsapp')).rejects.toThrow(
        "Step 'whatsapp' validation failed",
      );
    });
  });

  describe('validateStepCompletion', () => {
    it('should always pass for welcome step', async () => {
      const result = await service.validateStepCompletion('tenant-id', 'welcome');
      expect(result).toBe(true);
    });

    it('should pass for whatsapp step if session ready', async () => {
      mockSessionService.findAll.mockResolvedValue([
        { id: 'session-id', status: SessionStatus.READY },
      ]);

      const result = await service.validateStepCompletion('tenant-id', 'whatsapp');
      expect(result).toBe(true);
      expect(mockSessionService.findAll).toHaveBeenCalledWith(null, { limit: 100 });
    });

    it('should fail for whatsapp step if no ready session', async () => {
      mockSessionService.findAll.mockResolvedValue([
        { id: 'session-id', status: SessionStatus.CREATED },
      ]);

      const result = await service.validateStepCompletion('tenant-id', 'whatsapp');
      expect(result).toBe(false);
    });

    it('should always pass for test-message step (MVP implementation)', async () => {
      mockOnboardingRepo.findOne.mockResolvedValue({
        tenantId: 'tenant-id',
        currentStep: 'test-message',
        completedSteps: ['welcome', 'whatsapp'],
        createdAt: new Date(),
      });

      const result = await service.validateStepCompletion('tenant-id', 'test-message');
      expect(result).toBe(true);
    });

    it('should always pass for complete step', async () => {
      const result = await service.validateStepCompletion('tenant-id', 'complete');
      expect(result).toBe(true);
    });
  });
});
