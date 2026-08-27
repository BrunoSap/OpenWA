import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DataSource, QueryRunner } from 'typeorm';
import { of } from 'rxjs';
import { RlsInterceptor } from './rls.interceptor';

describe('RlsInterceptor', () => {
  let interceptor: RlsInterceptor;
  let clsService: ClsService;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    // Mock QueryRunner
    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock DataSource
    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as any;

    // Mock ClsService
    clsService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RlsInterceptor,
        {
          provide: ClsService,
          useValue: clsService,
        },
        {
          provide: 'DataDataSource',
          useValue: dataSource,
        },
      ],
    }).compile();

    interceptor = module.get<RlsInterceptor>(RlsInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should skip when RLS disabled (enableRLS=false)', async () => {
    // Mock enableRLS = false (default for dev/test environments)
    jest.spyOn(require('./rls.config'), 'enableRLS', 'get').mockReturnValue(false);

    const mockExecutionContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = {
      handle: jest.fn().mockReturnValue(of('result')),
    };

    const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);

    expect(mockCallHandler.handle).toHaveBeenCalled();
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('should skip when no tenantId in ClsService', async () => {
    // Mock enableRLS = true
    jest.spyOn(require('./rls.config'), 'enableRLS', 'get').mockReturnValue(true);
    jest.spyOn(clsService, 'get').mockReturnValue(undefined);

    const mockExecutionContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = {
      handle: jest.fn().mockReturnValue(of('result')),
    };

    const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);

    expect(mockCallHandler.handle).toHaveBeenCalled();
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('should set session variable when tenantId present', async () => {
    // Mock enableRLS = true
    jest.spyOn(require('./rls.config'), 'enableRLS', 'get').mockReturnValue(true);
    const tenantId = 'tenant-123';
    jest.spyOn(clsService, 'get').mockReturnValue(tenantId);

    const mockExecutionContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = {
      handle: jest.fn().mockReturnValue(of('result')),
    };

    await interceptor.intercept(mockExecutionContext, mockCallHandler);

    expect(dataSource.createQueryRunner).toHaveBeenCalled();
    expect(queryRunner.connect).toHaveBeenCalled();
    expect(queryRunner.query).toHaveBeenCalledWith(
      `SET LOCAL app.tenant_id = $1`,
      [tenantId],
    );
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('should clean up session variable after response', async () => {
    // Mock enableRLS = true
    jest.spyOn(require('./rls.config'), 'enableRLS', 'get').mockReturnValue(true);
    const tenantId = 'tenant-456';
    jest.spyOn(clsService, 'get').mockReturnValue(tenantId);

    const mockExecutionContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = {
      handle: jest.fn().mockReturnValue(of('result')),
    };

    const observable = await interceptor.intercept(mockExecutionContext, mockCallHandler);

    // Subscribe to trigger the tap operator
    await new Promise<void>((resolve) => {
      observable.subscribe({
        complete: () => {
          expect(queryRunner.query).toHaveBeenCalledWith(`RESET app.tenant_id`);
          resolve();
        },
      });
    });

    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('should release connection even if RESET fails', async () => {
    // Mock enableRLS = true
    jest.spyOn(require('./rls.config'), 'enableRLS', 'get').mockReturnValue(true);
    const tenantId = 'tenant-789';
    jest.spyOn(clsService, 'get').mockReturnValue(tenantId);

    // Mock RESET failure
    (queryRunner.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('RESET')) {
        return Promise.reject(new Error('RESET failed'));
      }
      return Promise.resolve();
    });

    const mockExecutionContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = {
      handle: jest.fn().mockReturnValue(of('result')),
    };

    const observable = await interceptor.intercept(mockExecutionContext, mockCallHandler);

    // Subscribe and wait for completion
    await new Promise<void>((resolve) => {
      observable.subscribe({
        complete: () => {
          resolve();
        },
      });
    });

    // Connection should still be released even if RESET failed
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
