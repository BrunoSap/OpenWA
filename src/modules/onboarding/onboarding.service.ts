import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnboardingState } from './entities/onboarding-state.entity';
import { OnboardingStateDto } from './dto/onboarding-state.dto';
import { TenantService } from '../tenant/tenant.service';
import { SessionService } from '../session/session.service';
import { SessionStatus } from '../session/entities/session.entity';

/**
 * Onboarding wizard step types
 */
export type OnboardingStep = 'welcome' | 'whatsapp' | 'test-message' | 'complete';

/**
 * OnboardingService - Tracks and validates tenant onboarding wizard progression
 * Phase 09 Plan 04: Tenant onboarding automation
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(OnboardingState, 'main')
    private readonly onboardingStateRepository: Repository<OnboardingState>,
    private readonly tenantService: TenantService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Get current onboarding state for a tenant
   * Returns default state if not found (tenant just created)
   */
  async getState(tenantId: string): Promise<OnboardingStateDto> {
    const state = await this.onboardingStateRepository.findOne({
      where: { tenantId },
    });

    if (!state) {
      // Default state for new tenants
      return {
        currentStep: 'welcome',
        completedSteps: [],
        metadata: {},
      };
    }

    return {
      currentStep: state.currentStep,
      completedSteps: state.completedSteps,
      metadata: state.metadata,
    };
  }

  /**
   * Advance to the next step in the onboarding wizard
   * Validates step completion before advancing
   *
   * @param tenantId - Tenant ID
   * @param step - Step to advance from (must match current step)
   * @returns Updated onboarding state
   */
  async advanceStep(tenantId: string, step: OnboardingStep): Promise<OnboardingStateDto> {
    // Verify tenant exists
    const tenant = await this.tenantService.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    // Get or create current state
    let state = await this.onboardingStateRepository.findOne({
      where: { tenantId },
    });

    if (!state) {
      // Create initial state if doesn't exist
      state = this.onboardingStateRepository.create({
        tenantId,
        currentStep: 'welcome',
        completedSteps: [],
        metadata: {},
      });
      await this.onboardingStateRepository.save(state);
    }

    // Validate current step matches requested step
    if (state.currentStep !== step) {
      throw new BadRequestException(
        `Cannot advance from step '${step}' - current step is '${state.currentStep}'`,
      );
    }

    // Validate step completion before advancing
    const isValid = await this.validateStepCompletion(tenantId, step);
    if (!isValid) {
      throw new BadRequestException(`Step '${step}' validation failed - requirements not met`);
    }

    // Add current step to completed steps
    if (!state.completedSteps.includes(step)) {
      state.completedSteps.push(step);
    }

    // Determine next step
    const nextStep = this.getNextStep(step);
    state.currentStep = nextStep;

    // Save updated state
    await this.onboardingStateRepository.save(state);

    this.logger.log(`Tenant ${tenantId} advanced from '${step}' to '${nextStep}'`);

    return {
      currentStep: state.currentStep,
      completedSteps: state.completedSteps,
      metadata: state.metadata,
    };
  }

  /**
   * Validate whether a step's completion requirements are met
   *
   * @param tenantId - Tenant ID
   * @param step - Step to validate
   * @returns true if validation passes, false otherwise
   */
  async validateStepCompletion(tenantId: string, step: OnboardingStep): Promise<boolean> {
    switch (step) {
      case 'welcome':
        // Welcome step has no validation - always passes
        return true;

      case 'whatsapp':
        // Validate at least one session is in 'ready' status
        try {
          const sessions = await this.sessionService.findAll(null, { limit: 100 });
          const hasReadySession = sessions.some((session) => session.status === SessionStatus.READY);
          this.logger.debug(`WhatsApp step validation for tenant ${tenantId}: ${hasReadySession}`);
          return hasReadySession;
        } catch (err) {
          this.logger.error(`Error validating whatsapp step for tenant ${tenantId}`, err);
          return false;
        }

      case 'test-message':
        // Validate at least one message sent (check via onboarding state creation timestamp)
        try {
          const state = await this.onboardingStateRepository.findOne({
            where: { tenantId },
          });
          if (!state) return false;

          // For MVP: Check if messages exist would require MessageRepository
          // For now, use a simplified check - if they got this far, they likely sent a message
          // Production implementation would query messages table:
          // const messageCount = await this.messageRepository.count({
          //   where: { tenantId, createdAt: MoreThan(state.createdAt) }
          // });
          // return messageCount > 0;

          // TODO: Implement proper message count check when MessageRepository is tenant-scoped
          this.logger.warn(
            `test-message validation not fully implemented - accepting by default for tenant ${tenantId}`,
          );
          return true;
        } catch (err) {
          this.logger.error(`Error validating test-message step for tenant ${tenantId}`, err);
          return false;
        }

      case 'complete':
        // Complete step has no validation - always passes
        return true;

      default:
        this.logger.error(`Unknown onboarding step: ${step}`);
        return false;
    }
  }

  /**
   * Determine the next step in the onboarding sequence
   */
  private getNextStep(currentStep: OnboardingStep): OnboardingStep {
    const stepSequence: OnboardingStep[] = ['welcome', 'whatsapp', 'test-message', 'complete'];
    const currentIndex = stepSequence.indexOf(currentStep);

    if (currentIndex === -1 || currentIndex === stepSequence.length - 1) {
      return 'complete'; // Stay at complete if already there or unknown step
    }

    return stepSequence[currentIndex + 1];
  }
}
