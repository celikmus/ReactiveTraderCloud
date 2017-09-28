import { Connection } from '../system/service/connection'

export interface Service {
  connection: Connection
  serviceType: string
}
