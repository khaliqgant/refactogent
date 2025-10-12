import { UserService } from '../services/UserService.js';
import { UserCreateInput, UserUpdateInput } from '../models/User.js';

export interface Request {
  params: { id?: string };
  body: any;
  query: any;
}

export interface Response {
  status(code: number): Response;
  json(data: any): void;
}

export class UserController {
  constructor(private userService: UserService) {}

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const input: UserCreateInput = req.body;
      const user = await this.userService.createUser(input);
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: 'User ID required' });
        return;
      }

      const user = await this.userService.getUserById(id);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      res.status(200).json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: 'User ID required' });
        return;
      }

      const input: UserUpdateInput = req.body;
      const user = await this.userService.updateUser(id, input);
      res.status(200).json({ success: true, data: user });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: 'User ID required' });
        return;
      }

      await this.userService.deleteUser(id);
      res.status(200).json({ success: true, message: 'User deleted' });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async listUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await this.userService.listUsers();
      res.status(200).json({ success: true, data: users, count: users.length });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
