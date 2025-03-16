import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { BlockradarApiService } from '../../blockradar-api.service';
import { Address, BlockradarResponse } from '../../interfaces/blockradar.interface';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletModule } from '../../wallet.module';
import { User } from '../../../auth/entities/auth.entity';

describe('Wallet (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let blockradarApiService: BlockradarApiService;
  let authToken: string;

  beforeAll(async () => {
    // Mock ConfigService
    const mockConfigService = {
      get: jest.fn((key) => {
        const config = {
          'jwt.secret': 'test-secret',
          'jwt.expiresIn': '1h',
          'redis.host': 'localhost',
          'redis.port': 6379,
          'redis.password': '',
          'blockradar.baseUrl': 'https://api.blockradar.example',
          'blockradar.apiKey': 'test-api-key',
        };
        return config[key];
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [User],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([User]),
        WalletModule,
      ],
    })
    .overrideProvider(ConfigService)
    .useValue(mockConfigService)
    .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);
    blockradarApiService = moduleFixture.get<BlockradarApiService>(BlockradarApiService);
    
    // Mock BlockradarApiService methods
    jest.spyOn(blockradarApiService, 'generateAddress').mockImplementation(() => 
      Promise.resolve<BlockradarResponse<Address>>({
        statusCode: 200,
        message: 'Address generated successfully',
        data: {
          address: '0xe1037B45b48390285e5067424053fa35c478296b',
          id: 'test-address-id',
          blockchain: {
            id: 'ethereum',
            name: 'ethereum',
            slug: 'eth',
            symbol: 'ETH',
            isEvmCompatible: true,
            tokenStandard: 'ERC20',
            logoUrl: 'https://example.com/eth.png',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            derivationPath: "m/44'/60'/0'/0/0"
          },
          name: 'Test Wallet',
          type: 'DEPOSIT',
          isActive: true,
          network: 'mainnet',
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          derivationPath: "m/44'/60'/0'/0/0",
          configurations: {
            disableAutoSweep: false,
            enableGaslessWithdraw: false,
            showPrivateKey: false
          }
        },
      })
    );
    
    jest.spyOn(blockradarApiService, 'getAddressTransactions').mockImplementation(() => 
      Promise.resolve({
        statusCode: 200,
        message: 'Transactions fetched successfully',
        data: [
          {
            id: 'tx-123456',
            hash: '0x1234567890abcdef',
            amount: '100',
            token: {
              symbol: 'ETH',
              decimals: 18,
            },
            from: '0x1234567890abcdef',
            to: '0xe1037B45b48390285e5067424053fa35c478296b',
            status: 'CONFIRMED',
            network: 'mainnet',
            blockNumber: 12345678,
            blockHash: '0xabcdef1234567890',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })
    );
    
    await app.init();
    
    // Generate a test auth token
    authToken = jwtService.sign({ 
      sub: 'test-user-id',
      email: 'test@example.com',
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('/api/v1/wallet/addresses (POST)', () => {
    it('should create a new wallet address', () => {
      return request.agent(app.getHttpServer())
        .post('/api/v1/wallet/addresses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Wallet',
          metadata: { account_number: '12345678' }
        })
        .expect(201)
        .expect(res => {
          expect(res.body).toHaveProperty('status', 'success');
          expect(res.body.data).toHaveProperty('address');
          expect(res.body.data).toHaveProperty('id');
        });
    });

    it('should reject request without authentication', () => {
      return request.agent(app.getHttpServer())
        .post('/api/v1/wallet/addresses')
        .send({
          name: 'Test Wallet'
        })
        .expect(401);
    });
  });

  describe('/api/v1/wallet/addresses/:id/transactions (GET)', () => {
    it('should fetch transactions for an address', () => {
      return request.agent(app.getHttpServer())
        .get('/api/v1/wallet/addresses/test-address-id/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect(res => {
          expect(res.body).toHaveProperty('status', 'success');
          expect(res.body.data).toBeInstanceOf(Array);
          expect(res.body.data[0]).toHaveProperty('hash');
        });
    });
  });
}); 