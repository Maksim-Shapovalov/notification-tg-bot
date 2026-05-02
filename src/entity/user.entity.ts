import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryColumn()
  id: number;

  @Column({ type: 'bigint' })
  domainId: number;

  @Column({ type: 'boolean', default: false })
  isActive: boolean;
}
