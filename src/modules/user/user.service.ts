import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserService {
  // This is a stub implementation for testing purposes
  private users = [];

  async findByEmail(email: string) {
    return this.users.find(user => user.email === email);
  }

  async findById(id: number) {
    return this.users.find(user => user.id === id);
  }

  async create(userData: any) {
    const id = this.users.length + 1;
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const newUser = {
      id,
      email: userData.email,
      password: hashedPassword,
      name: userData.name || 'User',
      createdAt: new Date()
    };
    
    this.users.push(newUser);
    return newUser;
  }

  async validatePassword(plainPassword: string, hashedPassword: string) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
} 