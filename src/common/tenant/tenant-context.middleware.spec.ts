import { TenantContextMiddleware } from './tenant-context.middleware';
import { ClsService } from 'nestjs-cls';
import { LEGACY_TENANT_ID } from '../constants';
import { ApiKey } from '../../modules/auth/entities/api-key.entity';

describe('TenantContextMiddleware', () => {
  let middleware: TenantContextMiddleware;
  let mockClsService: jest.Mocked<ClsService>;

  beforeEach(() => {
    mockClsService = {
      get: jest.fn(),
      set: jest.fn(),
    } as any;

    middleware = new TenantContextMiddleware(mockClsService);
  });

  it('should set tenantId from API key when present', () => {
    const tenantId = 'test-tenant-id';
    const req: any = {
      apiKey: { tenantId } as ApiKey,
    };
    const res: any = {};
    const next = jest.fn();

    mockClsService.get.mockReturnValue(undefined);

    middleware.use(req, res, next);

    expect(mockClsService.set).toHaveBeenCalledWith('tenantId', tenantId);
    expect(next).toHaveBeenCalled();
  });

  it('should use LEGACY_TENANT_ID when API key has no tenantId', () => {
    const req: any = {
      apiKey: { tenantId: null } as ApiKey,
    };
    const res: any = {};
    const next = jest.fn();

    mockClsService.get.mockReturnValue(undefined);

    middleware.use(req, res, next);

    expect(mockClsService.set).toHaveBeenCalledWith('tenantId', LEGACY_TENANT_ID);
    expect(next).toHaveBeenCalled();
  });

  it('should not override tenantId if already set in CLS', () => {
    const existingTenantId = 'existing-tenant-id';
    const req: any = {
      apiKey: { tenantId: 'new-tenant-id' } as ApiKey,
    };
    const res: any = {};
    const next = jest.fn();

    mockClsService.get.mockReturnValue(existingTenantId);

    middleware.use(req, res, next);

    expect(mockClsService.set).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should call next() when no API key present', () => {
    const req: any = {};
    const res: any = {};
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(mockClsService.set).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
