import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter, HttpExceptionFilter } from './http-exception.filter';
import { SentryReporter } from '../../sentry/sentry.reporter';

function makeMockHost(url = '/test', method = 'GET'): ArgumentsHost {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const request = { url, method };
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let captureSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    captureSpy = jest
      .spyOn(SentryReporter, 'capture')
      .mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should capture 500 errors in Sentry', () => {
    const exception = new HttpException('Server error', HttpStatus.INTERNAL_SERVER_ERROR);
    filter.catch(exception, makeMockHost());
    expect(captureSpy).toHaveBeenCalledWith(exception);
  });

  it('should capture 503 errors in Sentry', () => {
    const exception = new HttpException('Unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    filter.catch(exception, makeMockHost());
    expect(captureSpy).toHaveBeenCalledWith(exception);
  });

  it('should NOT capture 404 errors in Sentry', () => {
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(exception, makeMockHost());
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('should NOT capture 400 validation errors in Sentry', () => {
    const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
    filter.catch(exception, makeMockHost());
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('should NOT capture 401 unauthorized errors in Sentry', () => {
    const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    filter.catch(exception, makeMockHost());
    expect(captureSpy).not.toHaveBeenCalled();
  });
});

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let captureSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    captureSpy = jest
      .spyOn(SentryReporter, 'capture')
      .mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should capture Error instances in Sentry', () => {
    const error = new Error('Unexpected crash');
    filter.catch(error, makeMockHost());
    expect(captureSpy).toHaveBeenCalledWith(error);
  });

  it('should capture non-Error exceptions in Sentry', () => {
    const error = 'string error';
    filter.catch(error, makeMockHost());
    expect(captureSpy).toHaveBeenCalledWith(error);
  });

  it('should capture object exceptions in Sentry', () => {
    const error = { code: 'UNKNOWN', detail: 'boom' };
    filter.catch(error, makeMockHost());
    expect(captureSpy).toHaveBeenCalledWith(error);
  });

  it('should return 500 response for any unhandled exception', () => {
    const mockResponse = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const mockRequest = { url: '/api/v1/test', method: 'POST' };
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new Error('boom'), host);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    );
  });
});
